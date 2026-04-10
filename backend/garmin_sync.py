#!/usr/bin/env python3
"""
Garmin Connect sync script for UltraCoach.
Usage:
  python3 garmin_sync.py init EMAIL PASSWORD TOKENS_PATH
  python3 garmin_sync.py mfa MFA_CODE TOKENS_PATH
  python3 garmin_sync.py sync TOKENS_PATH DATA_PATH DB_PATH DAYS
  python3 garmin_sync.py test TOKENS_PATH

All commands output a single JSON line to stdout.
"""

import sys
import json
import os
import traceback
from datetime import date, timedelta, datetime

def out(obj):
    print(json.dumps(obj), flush=True)

def load_api(tokens_path):
    from garminconnect import Garmin
    api = Garmin()
    with open(tokens_path, 'r') as f:
        api.garth.loads(f.read())
    api.display_name = None
    return api

def save_tokens(api, tokens_path):
    os.makedirs(os.path.dirname(tokens_path), exist_ok=True)
    with open(tokens_path, 'w') as f:
        f.write(api.garth.dumps())

def cmd_init(email, password, tokens_path):
    from garminconnect import Garmin, GarminConnectAuthenticationError
    try:
        api = Garmin(email=email, password=password)
        api.login()
        save_tokens(api, tokens_path)
        out({"ok": True, "need_mfa": False})
    except GarminConnectAuthenticationError as e:
        msg = str(e)
        if "MFA" in msg or "NEEDS_MFA" in msg or "2FA" in msg:
            # Garmin sent a code to user's email — save partial session
            state_path = tokens_path + ".mfa_state"
            os.makedirs(os.path.dirname(state_path), exist_ok=True)
            with open(state_path, 'w') as f:
                f.write(api.garth.dumps())
            out({"ok": True, "need_mfa": True})
        else:
            out({"ok": False, "error": msg})
    except Exception as e:
        out({"ok": False, "error": str(e)})

def cmd_mfa(mfa_code, tokens_path):
    from garminconnect import Garmin
    try:
        state_path = tokens_path + ".mfa_state"
        if not os.path.exists(state_path):
            out({"ok": False, "error": "Session MFA expirée, relancez la connexion"})
            return
        api = Garmin()
        with open(state_path, 'r') as f:
            api.garth.loads(f.read())
        api.garth.resume(mfa_code)
        save_tokens(api, tokens_path)
        os.remove(state_path)
        out({"ok": True})
    except Exception as e:
        out({"ok": False, "error": str(e)})

def cmd_test(tokens_path):
    try:
        api = load_api(tokens_path)
        profile = api.get_full_name() or api.get_user_profile().get("displayName", "?")
        out({"ok": True, "name": profile})
    except Exception as e:
        out({"ok": False, "error": str(e)})

def cmd_sync(tokens_path, data_path, db_path, days):
    import sqlite3

    RUNNING_TYPES = {
        "running", "trail_running", "indoor_running", "treadmill_running",
        "track_running", "virtual_run", "ultra_run", "obstacle_run",
    }

    try:
        api = load_api(tokens_path)
        days = int(days)
        since = date.today() - timedelta(days=days)

        # ── Activités ──────────────────────────────────────────────────────────
        saved_activities = 0
        try:
            activities = api.get_activities_by_date(since.isoformat(), date.today().isoformat(), "running")
            activities += api.get_activities_by_date(since.isoformat(), date.today().isoformat(), "trail_running")

            # Charge le JSON existant
            existing_data = {"activities": [], "athlete": {}, "garmin_runs": [], "atl_ctl": [],
                             "endurance_score": [], "hill_score": [], "targets": [], "races": [], "insights": {}}
            if os.path.exists(data_path):
                with open(data_path, 'r') as f:
                    raw = f.read().replace("NaN", "null")
                    existing_data = json.loads(raw)

            existing_ids = set(str(a.get("garmin_id")) for a in existing_data["activities"] if a.get("garmin_id"))
            existing_keys = set(f"{a.get('Date','')[:10]}_{a.get('Distance_km')}" for a in existing_data["activities"])

            to_add = []
            for act in activities:
                type_key = (act.get("activityType", {}).get("typeKey") or "").lower()
                if type_key not in RUNNING_TYPES:
                    continue
                act_id = str(act.get("activityId", ""))
                dist_km = round((act.get("distance") or 0) / 1000, 2)
                time_h = round((act.get("duration") or 0) / 3600, 4)
                date_str = (act.get("startTimeLocal") or "").replace("T", " ")[:19]
                d = datetime.fromisoformat(date_str) if date_str else datetime.now()
                dplus = round(act.get("elevationGain") or 0)
                is_treadmill = type_key in ("indoor_running", "treadmill_running") or \
                    "tapis" in (act.get("activityName") or "").lower() or \
                    "treadmill" in (act.get("activityName") or "").lower()

                key = f"{date_str[:10]}_{dist_km}"
                if act_id and act_id in existing_ids:
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

            if to_add:
                existing_data["activities"] = sorted(
                    existing_data["activities"] + to_add,
                    key=lambda a: a.get("Date", "")
                )
                os.makedirs(os.path.dirname(data_path), exist_ok=True)
                with open(data_path, 'w') as f:
                    json.dump(existing_data, f, indent=2)
                saved_activities = len(to_add)
        except Exception as e:
            pass  # Log silently, continue to health sync

        # ── Données santé ──────────────────────────────────────────────────────
        saved_health = 0
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        for i in range(min(days, 30)):
            d = date.today() - timedelta(days=i)
            ds = d.isoformat()

            resting_hr = hrv = sleep_h = sleep_quality = None

            try:
                hr_data = api.get_heart_rates(ds)
                resting_hr = hr_data.get("restingHeartRate")
            except Exception:
                pass

            try:
                hrv_data = api.get_hrv_data(ds)
                hrv_val = (hrv_data.get("hrvSummary") or {}).get("lastNight")
                if hrv_val:
                    hrv = round(hrv_val)
            except Exception:
                pass

            try:
                sleep_data = api.get_sleep_data(ds)
                dto = (sleep_data.get("dailySleepDTO") or {})
                secs = dto.get("sleepTimeSeconds")
                if secs:
                    sleep_h = round(secs / 3600, 1)
                score = (dto.get("sleepScores") or {}).get("overall", {})
                if isinstance(score, dict):
                    v = score.get("value")
                    if v is not None:
                        sleep_quality = max(1, min(5, round(v / 20)))
            except Exception:
                pass

            if resting_hr or hrv or sleep_h:
                cur.execute("SELECT id, fc_repos, hrv, sleep_h FROM daily_logs WHERE date = ?", (ds,))
                row = cur.fetchone()
                if row:
                    cur.execute("""UPDATE daily_logs SET
                        fc_repos = CASE WHEN fc_repos IS NULL AND ? IS NOT NULL THEN ? ELSE fc_repos END,
                        hrv = CASE WHEN hrv IS NULL AND ? IS NOT NULL THEN ? ELSE hrv END,
                        sleep_h = CASE WHEN sleep_h IS NULL AND ? IS NOT NULL THEN ? ELSE sleep_h END,
                        sleep_quality = CASE WHEN sleep_quality IS NULL AND ? IS NOT NULL THEN ? ELSE sleep_quality END
                        WHERE date = ?""",
                        (resting_hr, resting_hr, hrv, hrv, sleep_h, sleep_h, sleep_quality, sleep_quality, ds))
                else:
                    cur.execute("INSERT OR IGNORE INTO daily_logs (date, fc_repos, hrv, sleep_h, sleep_quality) VALUES (?, ?, ?, ?, ?)",
                        (ds, resting_hr, hrv, sleep_h, sleep_quality))
                saved_health += 1

        conn.commit()
        conn.close()

        out({"ok": True, "savedActivities": saved_activities, "savedHealthDays": saved_health})

    except Exception as e:
        out({"ok": False, "error": str(e), "trace": traceback.format_exc()})

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
            cmd_sync(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
        else:
            out({"ok": False, "error": f"Unknown command: {cmd}"})
    except Exception as e:
        out({"ok": False, "error": str(e)})
