#!/usr/bin/env python3
"""
Garmin Connect sync script for UltraCoach.
Commands:
  init EMAIL PASSWORD TOKENS_PATH
  mfa MFA_CODE TOKENS_PATH
  test TOKENS_PATH
  sync TOKENS_PATH DATA_PATH DB_PATH GPX_DIR DAYS
"""

import sys
import json
import os
import traceback
from datetime import date, timedelta, datetime
from math import radians, cos, sin, sqrt, atan2

def out(obj):
    print(json.dumps(obj), flush=True)

def load_api(tokens_path):
    from garminconnect import Garmin
    api = Garmin()
    with open(tokens_path, 'r') as f:
        api.client.loads(f.read())
    # display_name n'est pas restauré depuis les tokens → sans lui, les endpoints
    # basés sur l'URL (get_heart_rates, get_rhr_day, get_stats) renvoient 403.
    if not getattr(api, "display_name", None):
        try:
            sp = api.client.connectapi("/userprofile-service/socialProfile")
            api.display_name = sp.get("displayName")
            api.full_name = sp.get("fullName")
        except Exception:
            pass
    return api

def save_tokens(api, tokens_path):
    os.makedirs(os.path.dirname(tokens_path), exist_ok=True)
    with open(tokens_path, 'w') as f:
        f.write(api.client.dumps())

# ── Haversine distance ──────────────────────────────────────────────────────
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    p = radians
    dlat = p(lat2 - lat1)
    dlon = p(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(p(lat1)) * cos(p(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

# ── Parse GPX bytes → elevation profile ────────────────────────────────────
def parse_gpx(gpx_bytes):
    import xml.etree.ElementTree as ET
    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
    root = ET.fromstring(gpx_bytes if isinstance(gpx_bytes, str) else gpx_bytes.decode('utf-8', errors='replace'))
    points = []
    dist = 0.0
    prev = None
    for trkpt in root.findall('.//gpx:trkpt', ns):
        lat = float(trkpt.get('lat', 0))
        lon = float(trkpt.get('lon', 0))
        ele_el = trkpt.find('gpx:ele', ns)
        ele = float(ele_el.text) if ele_el is not None else 0
        if prev:
            dist += haversine(prev[0], prev[1], lat, lon)
        points.append({'d': round(dist / 1000, 3), 'e': round(ele, 1)})
        prev = (lat, lon)
    if not points:
        return None
    # Calcule D+ et D-
    dplus = dminus = 0
    for i in range(1, len(points)):
        diff = points[i]['e'] - points[i-1]['e']
        if diff > 0: dplus += diff
        else: dminus += abs(diff)
    return {
        'points': points,
        'stats': {
            'dist_km': round(dist / 1000, 2),
            'dplus': round(dplus),
            'dminus': round(dminus),
        }
    }

# ── Commandes ───────────────────────────────────────────────────────────────

def cmd_init(email, password, tokens_path):
    from garminconnect import Garmin, GarminConnectAuthenticationError
    try:
        api = Garmin(email=email, password=password, return_on_mfa=True)
        client_state, _ = api.login()
        if client_state is not None:
            # MFA required — persist client_state dict + partial client tokens
            state_path = tokens_path + ".mfa_state"
            os.makedirs(os.path.dirname(state_path), exist_ok=True)
            import json as _json
            with open(state_path, 'w') as f:
                _json.dump({
                    "client_state": client_state,
                    "client_tokens": api.client.dumps(),
                    "email": email,
                    "password": password,
                }, f)
            out({"ok": True, "need_mfa": True})
        else:
            save_tokens(api, tokens_path)
            out({"ok": True, "need_mfa": False})
    except GarminConnectAuthenticationError as e:
        out({"ok": False, "error": str(e)})
    except Exception as e:
        out({"ok": False, "error": str(e)})

def cmd_mfa(mfa_code, tokens_path):
    from garminconnect import Garmin
    import json as _json
    try:
        state_path = tokens_path + ".mfa_state"
        if not os.path.exists(state_path):
            out({"ok": False, "error": "Session MFA expirée, relancez la connexion"})
            return
        with open(state_path, 'r') as f:
            state = _json.load(f)
        email = state.get("email", "")
        password = state.get("password", "")
        client_state = state["client_state"]
        api = Garmin(email=email, password=password, return_on_mfa=True)
        api.client.loads(state["client_tokens"])
        api.resume_login(client_state, mfa_code)
        save_tokens(api, tokens_path)
        os.remove(state_path)
        out({"ok": True})
    except Exception as e:
        out({"ok": False, "error": str(e)})

def cmd_test(tokens_path):
    try:
        api = load_api(tokens_path)
        try:
            name = api.get_full_name()
        except:
            profile = api.get_user_profile()
            name = profile.get("displayName") or profile.get("userName") or "?"
        out({"ok": True, "name": name})
    except Exception as e:
        out({"ok": False, "error": str(e)})

def cmd_sync(tokens_path, data_path, db_path, gpx_dir, days):
    import sqlite3

    RUNNING_TYPES = {
        "running", "trail_running", "indoor_running", "treadmill_running",
        "track_running", "virtual_run", "ultra_run", "obstacle_run",
    }

    try:
        api = load_api(tokens_path)
        days = int(days)
        since = date.today() - timedelta(days=days)
        os.makedirs(gpx_dir, exist_ok=True)
        os.makedirs(os.path.dirname(data_path), exist_ok=True)

        # ── Activités + GPX ────────────────────────────────────────────────
        saved_activities = 0
        gpx_index = {}  # date → garmin_id

        # Charge l'index GPX existant
        gpx_index_path = os.path.join(gpx_dir, 'index.json')
        if os.path.exists(gpx_index_path):
            with open(gpx_index_path) as f:
                gpx_index = json.load(f)

        try:
            raw = []
            for type_key in ["running", "trail_running"]:
                try:
                    raw += api.get_activities_by_date(since.isoformat(), date.today().isoformat(), type_key)
                except:
                    pass

            # Charge le JSON existant
            existing_data = {"activities": [], "athlete": {}, "garmin_runs": [], "atl_ctl": [],
                             "endurance_score": [], "hill_score": [], "targets": [], "races": [], "insights": {}}
            if os.path.exists(data_path):
                with open(data_path, 'r') as f:
                    content = f.read().replace("NaN", "null")
                    existing_data = json.loads(content)

            existing_ids = set(str(a.get("garmin_id")) for a in existing_data["activities"] if a.get("garmin_id"))
            existing_keys = set(f"{a.get('Date','')[:10]}_{a.get('Distance_km')}" for a in existing_data["activities"])

            to_add = []
            new_gpx_activity_ids = []  # (date_str, garmin_id) à télécharger

            for act in raw:
                type_k = (act.get("activityType", {}).get("typeKey") or "").lower()
                if type_k not in RUNNING_TYPES:
                    continue
                act_id = str(act.get("activityId", ""))
                dist_km = round((act.get("distance") or 0) / 1000, 2)
                time_h = round((act.get("duration") or 0) / 3600, 4)
                date_str = (act.get("startTimeLocal") or "").replace("T", " ")[:19]
                d = datetime.fromisoformat(date_str) if date_str else datetime.now()
                dplus = round(act.get("elevationGain") or 0)
                is_treadmill = type_k in ("indoor_running", "treadmill_running") or \
                    "tapis" in (act.get("activityName") or "").lower() or \
                    "treadmill" in (act.get("activityName") or "").lower()

                # Tapis : Garmin renvoie elevationGain=0. Correction protocole pente 7,5% :
                # 8 km/h si séance ≤45min, sinon 7 km/h ; D+ = distance × 0,075.
                if is_treadmill and (not dplus) and time_h > 0:
                    dur_min = time_h * 60
                    speed_kmh = 8 if dur_min <= 45 else 7
                    dplus = round(speed_kmh * (dur_min / 60) * 1000 * 0.075)

                key = f"{date_str[:10]}_{dist_km}"
                if act_id and act_id in existing_ids:
                    # Activité existante — vérifie si GPX manque
                    if act_id and not os.path.exists(os.path.join(gpx_dir, f"{act_id}.json")):
                        new_gpx_activity_ids.append((date_str[:10], act_id))
                    continue
                if key in existing_keys:
                    continue

                converted = {
                    "Date": date_str,
                    "Distance_km": dist_km,
                    "D_plus_exact": dplus,
                    "HR_moy": int(act["averageHR"]) if act.get("averageHR") else None,
                    "HR_max": int(act["maxHR"]) if act.get("maxHR") else None,
                    "Allure": round(time_h * 60 / dist_km, 2) if dist_km > 0 and time_h > 0 else None,
                    "Temps_h": time_h,
                    "Effort": act.get("activityTrainingLoad"),
                    "Vitesse": round(dist_km * 1000 / (time_h * 3600), 2) if dist_km > 0 and time_h > 0 else None,
                    "Calories": int(act["calories"]) if act.get("calories") else None,
                    "Temp_moy": None,
                    "is_treadmill": is_treadmill,
                    "Year": d.year,
                    "Month": d.month,
                    "garmin_id": act.get("activityId"),
                }
                to_add.append(converted)
                existing_ids.add(act_id)
                existing_keys.add(key)
                if act_id and not is_treadmill:
                    new_gpx_activity_ids.append((date_str[:10], act_id))

            if to_add:
                existing_data["activities"] = sorted(
                    existing_data["activities"] + to_add,
                    key=lambda a: a.get("Date", "")
                )
                with open(data_path, 'w') as f:
                    json.dump(existing_data, f, indent=2)
                saved_activities = len(to_add)

            # Télécharge les GPX (max 10 par sync pour ne pas surcharger)
            for date_str, act_id in new_gpx_activity_ids[:10]:
                try:
                    gpx_path = os.path.join(gpx_dir, f"{act_id}.json")
                    if os.path.exists(gpx_path):
                        continue
                    gpx_bytes = api.download_activity(int(act_id), dl_fmt=4)  # 4 = GPX
                    if gpx_bytes:
                        parsed = parse_gpx(gpx_bytes)
                        if parsed:
                            with open(gpx_path, 'w') as f:
                                json.dump(parsed, f)
                            gpx_index[date_str] = act_id
                except Exception:
                    pass

            # Sauvegarde l'index GPX
            with open(gpx_index_path, 'w') as f:
                json.dump(gpx_index, f)

        except Exception as e:
            pass  # Continue vers la sync santé

        # ── Données santé ──────────────────────────────────────────────────
        saved_health = 0
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        for i in range(min(days, 30)):
            d = date.today() - timedelta(days=i)
            ds = d.isoformat()

            resting_hr = hrv = sleep_h = sleep_quality = None
            body_battery_morning = body_battery_evening = stress_avg = None
            gpx_garmin_id = gpx_index.get(ds)

            # FC repos
            try:
                hr_data = api.get_heart_rates(ds)
                resting_hr = hr_data.get("restingHeartRate")
            except: pass

            # HRV
            try:
                hrv_data = api.get_hrv_data(ds)
                v = (hrv_data.get("hrvSummary") or {}).get("lastNightAvg")
                if v: hrv = round(v)
            except: pass

            # Sommeil
            try:
                sleep_data = api.get_sleep_data(ds)
                dto = sleep_data.get("dailySleepDTO") or {}
                secs = dto.get("sleepTimeSeconds")
                if secs: sleep_h = round(secs / 3600, 1)
                score = (dto.get("sleepScores") or {}).get("overall", {})
                if isinstance(score, dict) and score.get("value") is not None:
                    sleep_quality = max(1, min(5, round(score["value"] / 20)))
            except: pass

            # Body Battery
            try:
                bb_data = api.get_body_battery(ds)
                if bb_data and isinstance(bb_data, list) and len(bb_data) > 0:
                    values = [v["bodyBatteryLevel"] for v in bb_data[0].get("bodyBatteryValuesArray", []) if v.get("bodyBatteryLevel") is not None]
                    if values:
                        body_battery_morning = values[0]   # Valeur au réveil
                        body_battery_evening = values[-1]  # Valeur du soir
            except: pass

            # Stress moyen
            try:
                stress_data = api.get_stress_data(ds)
                avg = stress_data.get("avgStressLevel")
                if avg and avg > 0: stress_avg = avg
            except: pass

            if any(v is not None for v in [resting_hr, hrv, sleep_h, body_battery_morning, stress_avg, gpx_garmin_id]):
                cur.execute("SELECT id, fc_repos, hrv, sleep_h, body_battery_morning FROM daily_logs WHERE date = ?", (ds,))
                row = cur.fetchone()

                def coalesce_update(col, new_val, existing):
                    return new_val if (new_val is not None and existing is None) else None

                if row:
                    cur.execute("""UPDATE daily_logs SET
                        fc_repos = CASE WHEN fc_repos IS NULL AND ? IS NOT NULL THEN ? ELSE fc_repos END,
                        hrv = CASE WHEN hrv IS NULL AND ? IS NOT NULL THEN ? ELSE hrv END,
                        sleep_h = CASE WHEN sleep_h IS NULL AND ? IS NOT NULL THEN ? ELSE sleep_h END,
                        sleep_quality = CASE WHEN sleep_quality IS NULL AND ? IS NOT NULL THEN ? ELSE sleep_quality END,
                        body_battery_morning = CASE WHEN body_battery_morning IS NULL AND ? IS NOT NULL THEN ? ELSE body_battery_morning END,
                        body_battery_evening = CASE WHEN body_battery_evening IS NULL AND ? IS NOT NULL THEN ? ELSE body_battery_evening END,
                        stress_avg = CASE WHEN stress_avg IS NULL AND ? IS NOT NULL THEN ? ELSE stress_avg END,
                        gpx_garmin_id = CASE WHEN gpx_garmin_id IS NULL AND ? IS NOT NULL THEN ? ELSE gpx_garmin_id END
                        WHERE date = ?""",
                        (resting_hr, resting_hr, hrv, hrv, sleep_h, sleep_h,
                         sleep_quality, sleep_quality,
                         body_battery_morning, body_battery_morning,
                         body_battery_evening, body_battery_evening,
                         stress_avg, stress_avg,
                         gpx_garmin_id, gpx_garmin_id, ds))
                else:
                    cur.execute("""INSERT OR IGNORE INTO daily_logs
                        (date, fc_repos, hrv, sleep_h, sleep_quality,
                         body_battery_morning, body_battery_evening, stress_avg, gpx_garmin_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (ds, resting_hr, hrv, sleep_h, sleep_quality,
                         body_battery_morning, body_battery_evening, stress_avg, gpx_garmin_id))
                saved_health += 1

        conn.commit()
        conn.close()

        out({"ok": True, "savedActivities": saved_activities, "savedHealthDays": saved_health})

    except Exception as e:
        out({"ok": False, "error": str(e), "trace": traceback.format_exc()})

ZONE_MAP = {
    'Z1': (1, 1), 'Z1-Z2': (1, 2), 'Z2': (2, 2),
    'Z2-Z3': (2, 3), 'Z3': (3, 3), 'Z3-Z4': (3, 4),
    'Z4': (4, 4), 'Z4-Z5': (4, 5), 'Z5': (5, 5),
}

SKIP_TYPES = {'repos', 'récup', 'renforcement', 'escalier', 'vélo', 'natation'}

def build_garmin_workout(session):
    """Convert UltraCoach session dict to Garmin workout JSON."""
    zone_str = (session.get('zone') or 'Z2').upper().replace(' ', '').replace('−', '-')
    z_min, z_max = ZONE_MAP.get(zone_str, (2, 2))

    dist_m = int((session.get('distance') or 0) * 1000)
    dur_s  = int((session.get('duration_min') or 0) * 60)

    steps = []
    order = 1
    big = dist_m > 5000 or dur_s > 1800

    def step(type_id, type_key, cond_id, cond_key, cond_val, tgt_id, tgt_key, v1, v2):
        nonlocal order
        s = {
            "type": "ExecutableStepDTO",
            "stepOrder": order,
            "stepType": {"stepTypeId": type_id, "stepTypeKey": type_key},
            "endCondition": {"conditionTypeId": cond_id, "conditionTypeKey": cond_key,
                             "displayOrder": cond_id, "displayable": True},
            "endConditionValue": cond_val,
            "targetType": {"workoutTargetTypeId": tgt_id, "workoutTargetTypeKey": tgt_key},
            "targetValueOne": v1,
            "targetValueTwo": v2,
        }
        order += 1
        return s

    if big:
        steps.append(step(1, "warmup",   2, "time",     600,  1, "no.target", None, None))

    if dist_m > 0:
        steps.append(step(3, "interval", 3, "distance", dist_m, 4, "heart.rate.zone", z_min, z_max))
    elif dur_s > 0:
        steps.append(step(3, "interval", 2, "time",     dur_s,  4, "heart.rate.zone", z_min, z_max))
    else:
        steps.append(step(3, "interval", 1, "lap.button", None, 4, "heart.rate.zone", z_min, z_max))

    if big:
        steps.append(step(2, "cooldown", 2, "time",     300,  1, "no.target", None, None))

    name_parts = [session.get('type', 'Séance')]
    if session.get('distance'): name_parts.append(f"{session['distance']}km")
    if session.get('zone'):     name_parts.append(session['zone'])
    name = ' '.join(str(p) for p in name_parts)

    return {
        "workoutName": name[:50],
        "description": (session.get('desc') or '')[:255],
        "sportType": {"sportTypeId": 1, "sportTypeKey": "running"},
        "workoutSegments": [{
            "segmentOrder": 1,
            "sportType": {"sportTypeId": 1, "sportTypeKey": "running"},
            "workoutSteps": steps,
        }],
    }

def cmd_export_workouts(tokens_path, sessions_json_path):
    try:
        api = load_api(tokens_path)
        with open(sessions_json_path) as f:
            sessions = json.load(f)

        results = []
        for s in sessions:
            stype = (s.get('type') or '').lower()
            if stype in SKIP_TYPES:
                continue
            if not s.get('date'):
                continue

            try:
                wkt = build_garmin_workout(s)
                resp = api.client.post("workout-service/workout", json=wkt)
                workout_id = resp.get("workoutId") if isinstance(resp, dict) else resp.json().get("workoutId")
                if not workout_id:
                    results.append({"date": s["date"], "type": s["type"], "ok": False, "error": "No workoutId returned"})
                    continue
                api.client.post(f"workout-service/schedule/{workout_id}", json={"date": s["date"]})
                results.append({"date": s["date"], "type": s["type"], "ok": True, "name": wkt["workoutName"]})
            except Exception as e:
                results.append({"date": s["date"], "type": s.get("type", "?"), "ok": False, "error": str(e)})

        ok_count = sum(1 for r in results if r["ok"])
        out({"ok": True, "exported": ok_count, "total": len(results), "results": results})

    except Exception as e:
        out({"ok": False, "error": str(e)})

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if cmd == "init":
            cmd_init(sys.argv[2], sys.argv[3], sys.argv[4])
        elif cmd == "mfa":
            cmd_mfa(sys.argv[2], sys.argv[3])
        elif cmd == "test":
            cmd_test(sys.argv[2])
        elif cmd == "sync":
            cmd_sync(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6])
        elif cmd == "export_workouts":
            cmd_export_workouts(sys.argv[2], sys.argv[3])
        else:
            out({"ok": False, "error": f"Unknown command: {cmd}"})
    except Exception as e:
        out({"ok": False, "error": str(e)})
