/**
 * SwissPeaks UTMB 2026 — Plan d'entraînement complet
 * 16 semaines · 15 mai → 28 août 2026 · ~950km · ~24 000m D+
 * Structure: TYPE A (Lun/Mer), TYPE B (Mar/Jeu), LONGUE (Ven), SAM, RÉCUP (Dim)
 */

// ── Métadonnées semaines ────────────────────────────────────────────────────────

const WEEKS = [
  { id:'S1',  start:'2026-05-11', label:'Chevaliers (15/05)',      phase:'RACE',       km:18,  dplus:100,  sauna:false, focus:'J-4 → Chevaliers vendredi 15/05 17h. Repos total J-1.' },
  { id:'S2',  start:'2026-05-18', label:'Récup 1 — post-Chevaliers', phase:'RÉCUP',    km:30,  dplus:200,  sauna:false, focus:'Récupération active. Zéro course 2 premiers jours. Vélo et marche.' },
  { id:'S3',  start:'2026-05-25', label:'Récup 2 — intro structure', phase:'RÉCUP',    km:52,  dplus:500,  sauna:false, focus:'Réintroduction SwissPeaks en douceur. Renfo très léger, pas d\'excentrique.' },
  { id:'S4',  start:'2026-06-01', label:'Build 1',                  phase:'BUILD',      km:80,  dplus:900,  sauna:false, focus:'Structure SwissPeaks complète. TYPE A + TYPE B lancés.' },
  { id:'S5',  start:'2026-06-08', label:'Build 2',                  phase:'BUILD',      km:90,  dplus:1400, sauna:false, focus:'Montée charge. Nordique assisté élastique. Escaliers 30min.' },
  { id:'S6',  start:'2026-06-15', label:'Build 3',                  phase:'BUILD',      km:96,  dplus:1900, sauna:false, focus:'Dernière BUILD avant mariage. Longue 28km. Arrêt renfo lourd J-5.' },
  { id:'S7',  start:'2026-06-22', label:'Pré-mariage 1 + Mariage (27/06)', phase:'MARIAGE', km:50, dplus:800, sauna:false, focus:'Mariage samedi 27/06. Réduire progressivement. Sauna prêt au retour.' },
  { id:'S8',  start:'2026-06-29', label:'Reprise + Sauna démarre', phase:'BUILD',       km:72,  dplus:1500, sauna:true,  focus:'Supercompensation post-mariage. SAUNA démarre (Aspria, après séances soir).' },
  { id:'S9',  start:'2026-07-06', label:'Charge 1 — Sortie nuit',  phase:'CHARGE',     km:100, dplus:3000, sauna:true,  focus:'SORTIE NUIT vendredi 21h Forêt Soignes. Longue 32km+ Ardennes sam.' },
  { id:'S10', start:'2026-07-13', label:'Mariage 2 (18/07)',        phase:'MARIAGE',    km:68,  dplus:1500, sauna:true,  focus:'Mariage samedi 18/07. SwissPeaks Lun-Jeu maintenu. Pas de longue sam.' },
  { id:'S11', start:'2026-07-20', label:'PIC UTMB — Semaine clé',  phase:'CHARGE',     km:120, dplus:5000, sauna:true,  focus:'SEMAINE LA PLUS IMPORTANTE. Ultra-longue 45-50km ven 17h Ardennes. Sweet spot J-28.' },
  { id:'S12', start:'2026-07-27', label:'Mariage 3 (01/08) — sweet spot', phase:'MARIAGE', km:55, dplus:1800, sauna:true, focus:'Mariage sam 01/08. Ven sortie longue. Sweet spot UTMB en cours.' },
  { id:'S13', start:'2026-08-03', label:'Maintien — Vosges/Ardennes', phase:'CHARGE',  km:90,  dplus:3000, sauna:true,  focus:'Reprendre après mariage 3. Longue 32km sam Vosges Grand Ballon ou Ardennes.' },
  { id:'S14', start:'2026-08-10', label:'Affûtage 1 — J-18 UTMB',  phase:'AFFÛTAGE',  km:68,  dplus:2000, sauna:true,  focus:'-30% volume. ARRÊT SAUNA lundi 17/08. Arrêt renfo lourd.' },
  { id:'S15', start:'2026-08-17', label:'Affûtage 2 — J-11 UTMB',  phase:'AFFÛTAGE',  km:42,  dplus:500,  sauna:false, focus:'-50% volume. ARRÊT SAUNA. Zéro renfo. Footings légers + strides.' },
  { id:'S16', start:'2026-08-24', label:'Race Week — UTMB 28/08',   phase:'RACE',      km:15,  dplus:100,  sauna:false, focus:'À Chamonix. Repos total mer 26/08 (J-2) et jeu 27/08 (J-1). UTMB 28/08 17h.' },
];

// ── Configs par semaine ─────────────────────────────────────────────────────────

const CONFIGS = {
  S3: {
    renfo_a: { desc:'RENFO A léger: fentes 3×15, step-up 3×12, hip thrust 3×12, mollets 3×20', duration:30 },
    renfo_b: { desc:'RENFO B léger: planche 3×40s, bird-dog 3×12, dead bug 3×10, clamshell 3×15', duration:25 },
    tapis:   { pente:'10%', duration:20, dplus:230 },
    escaliers: null,
    velo:    { duration:25 },
    cotes_mar: '4x côtes légères Parc Malou (pentes modérées)',
    cotes_jeu: '4x côtes légères Rue des Floralies (60% effort)',
    ven: { km:14, loc:'Forêt Soignes', notes:'FC<133', dplus:0 },
    sam: { km:15, loc:'Forêt Soignes', notes:'FC<132', dplus:0 },
  },
  S4: {
    renfo_a: { desc:'RENFO A: squat bulgare 4×8, step-up 3×12, wall sit 3×45s, mollets 3×20', duration:40 },
    renfo_b: { desc:'RENFO B: hip thrust 30kg 4×12, planche 3×45s, bird-dog 3×12, clamshell 3×20', duration:35 },
    tapis:   { pente:'10%', duration:30, dplus:290 },
    escaliers: { duration:20, dplus:200 },
    velo:    { duration:20 },
    cotes_mar: '6x sprints Rue des Floralies (>1min, FC 148-158)',
    cotes_jeu: '6x montées Parc de Woluwe (3min, 4-8%) + 3x sprints Floralies',
    ven: { km:22, loc:'Brabant Wallon', notes:'FC<140 D+', dplus:300 },
    sam: { km:22, loc:'Forêt Soignes', notes:'FC<135', dplus:100 },
  },
  S5: {
    renfo_a: { desc:'RENFO A: squat bulgare +poids, nordique assisté élastique 3×6, descente step excentrique 3×10', duration:42 },
    renfo_b: { desc:'RENFO B: hip thrust 40kg 4×12, planche 50s, RDL unijambiste 3×10, good morning 3×15', duration:38 },
    tapis:   { pente:'12%', duration:30, dplus:340 },
    escaliers: { duration:30, dplus:300 },
    velo:    { duration:20 },
    cotes_mar: '7x sprints Rue des Floralies (FC 148-158)',
    cotes_jeu: '7x montées Parc de Woluwe (3-4min, 4-8%) + 3x sprints Floralies',
    ven: { km:24, loc:'Brabant Wallon', notes:'FC<140 D+', dplus:400 },
    sam: { km:25, loc:'Brabant Wallon', notes:'FC<136 D+', dplus:400 },
  },
  S6: {
    renfo_a: { desc:'RENFO A: squat bulgare ++, nordique assisté 3×7, descente step excentrique 3×12', duration:43 },
    renfo_b: { desc:'RENFO B: hip thrust 50kg 4×12, planche 55s, clamshell élastique, side planche rotation', duration:40 },
    tapis:   { pente:'12%', duration:30, dplus:340 },
    escaliers: { duration:35, dplus:350 },
    velo:    { duration:25 },
    cotes_mar: '8x sprints Rue des Floralies (FC 148-162)',
    cotes_jeu: '8x montées Parc de Woluwe (3-4min) + 4x sprints Floralies (FC 145-158)',
    ven: { km:26, loc:'Brabant Wallon', notes:'FC<140 D+', dplus:500 },
    sam: { km:28, loc:'Ardennes ou Brabant Wallon', notes:'FC<136 D+', dplus:600 },
  },
  S7: {
    renfo_a: { desc:'RENFO A allégé: fentes 3×15, step-up 3×12, mollets 3×20 (pas de nordique)', duration:30 },
    renfo_b: { desc:'Core léger: planche 3×45s, bird-dog 3×12', duration:20 },
    tapis:   { pente:'10%', duration:25, dplus:230 },
    escaliers: { duration:20, dplus:150 },
    velo:    { duration:20 },
    cotes_mar: '5x côtes légères Floralies (70% effort)',
    cotes_jeu: '4x côtes très légères Floralies (DERNIER EFFORT avant mariage)',
    ven: null, // Repos J-1 mariage
    sam: null, // MARIAGE
  },
  S8: {
    renfo_a: { desc:'RENFO A: squat bulgare +8kg, nordique assisté 3×6, step-up 3×12, mollets 3×20', duration:40 },
    renfo_b: { desc:'RENFO B: hip thrust 50kg 4×12, planche 60s, clamshell, RDL unijambiste', duration:40 },
    tapis:   { pente:'10%', duration:30, dplus:290 },
    escaliers: { duration:25, dplus:250 },
    velo:    { duration:20 },
    sauna:   true,
    cotes_mar: '6x sprints Rue des Floralies (FC 148-160)',
    cotes_jeu: '6x montées Parc de Woluwe (3-4min) + 3x sprints Floralies',
    ven: { km:22, loc:'Brabant Wallon', notes:'FC<138 D+', dplus:300 },
    sam: { km:24, loc:'Ardennes', notes:'FC<136 D+', dplus:400 },
  },
  S9: {
    renfo_a: { desc:'RENFO A: squat bulgare +10kg, nordique assisté 3×7, descente step 3×12, mollets', duration:43 },
    renfo_b: { desc:'RENFO B: hip thrust 55kg 4×12, planche 65s, side planche rotation, good morning', duration:42 },
    tapis:   { pente:'12%', duration:30, dplus:340 },
    escaliers: { duration:35, dplus:350 },
    velo:    { duration:20 },
    sauna:   true,
    cotes_mar: '8x sprints Rue des Floralies (FC 150-162)',
    cotes_jeu: '8x montées Parc de Woluwe (3-4min) + 4x sprints Floralies',
    ven: { km:25, loc:'Forêt Soignes', notes:'SORTIE NUIT — départ 21h — FC<135', dplus:200, night:true },
    sam: { km:32, loc:'Ardennes', notes:'FC<136 D+', dplus:800 },
  },
  S10: {
    renfo_a: { desc:'RENFO A: squat bulgare +10kg, nordique assisté 3×7, descente step', duration:43 },
    renfo_b: { desc:'RENFO B: hip thrust 55kg 4×12, planche 65s, clamshell, RDL', duration:40 },
    tapis:   { pente:'12%', duration:30, dplus:340 },
    escaliers: { duration:35, dplus:350 },
    velo:    { duration:20 },
    sauna:   true,
    cotes_mar: '7x sprints Rue des Floralies (FC 150-162)',
    cotes_jeu: '7x montées Parc de Woluwe + 3x sprints Floralies',
    ven: { km:22, loc:'Brabant Wallon', notes:'FC<138 D+ — J-1 mariage', dplus:300 },
    sam: null, // MARIAGE
  },
  S11: {
    renfo_a: { desc:'RENFO A MAX: nordique SANS assistance 3×7, squat bulgare +12kg, descente step 3×12', duration:45 },
    renfo_b: { desc:'RENFO B MAX: hip thrust 60kg 4×12, planche 75s, side planche, good morning', duration:45 },
    tapis:   { pente:'15%', duration:30, dplus:380 },
    escaliers: { duration:40, dplus:400 },
    velo:    { duration:20 },
    sauna:   true,
    cotes_mar: '10x sprints Rue des Floralies (FC 155-168)',
    cotes_jeu: '10x montées Parc de Woluwe (3-4min soutenu) + 4x sprints Floralies',
    ven: { km:48, loc:'Ardennes', notes:'ULTRA-LONGUE — départ 17h-18h — FC<135', dplus:2000, ultralong:true },
    sam: { km:18, loc:'Forêt Soignes', notes:'Récup trail FC<128 plat', dplus:100 },
  },
  S12: {
    renfo_a: { desc:'RENFO A: nordique SANS assistance 3×8, squat bulgare +12kg', duration:43 },
    renfo_b: { desc:'RENFO B: hip thrust 60kg 4×12, planche 75s, side planche', duration:43 },
    tapis:   { pente:'15%', duration:30, dplus:380 },
    escaliers: { duration:35, dplus:350 },
    velo:    { duration:20 },
    sauna:   true,
    cotes_mar: '8x sprints Rue des Floralies (FC 152-163)',
    cotes_jeu: '8x montées Parc de Woluwe + 4x sprints Floralies (DERNIER EFFORT avant mariage 3)',
    ven: { km:22, loc:'Brabant Wallon', notes:'FC<136 D+ — DÉBUT SWEET SPOT J-28', dplus:300 },
    sam: null, // MARIAGE
  },
  S13: {
    renfo_a: { desc:'RENFO A léger: step-up 3×12, mollets 3×20, fentes 3×15 (pas de nordique lourd)', duration:35 },
    renfo_b: { desc:'RENFO B: hip thrust 55kg 4×12, planche 65s, core', duration:38 },
    tapis:   { pente:'12%', duration:25, dplus:250 },
    escaliers: { duration:30, dplus:300 },
    velo:    { duration:20 },
    sauna:   true,
    cotes_mar: '6x sprints Rue des Floralies (FC 148-160)',
    cotes_jeu: '6x montées Parc de Woluwe + 3x sprints Floralies',
    ven: { km:22, loc:'Brabant Wallon', notes:'FC<138 D+', dplus:300 },
    sam: { km:32, loc:'Vosges Grand Ballon ou Ardennes', notes:'FC<136 D+', dplus:1000 },
  },
  S14: {
    renfo_a: { desc:'RENFO A LÉGER: fentes 3×15, step-up 3×12 (ARRÊT nordique lourd)', duration:25 },
    renfo_b: { desc:'Core léger: planche 3×50s, bird-dog (DERNIER RENFO LOURD)', duration:20 },
    tapis:   { pente:'10%', duration:20, dplus:200 },
    escaliers: { duration:20, dplus:180 },
    velo:    { duration:15 },
    sauna:   true, // dernière séance mer 13/08
    cotes_mar: '5x sprints Rue des Floralies (FC 145-155)',
    cotes_jeu: '4x côtes légères Woluwe ou Floralies',
    ven: { km:18, loc:'Forêt Soignes', notes:'FC<138 + 6×100m strides', dplus:0 },
    sam: { km:22, loc:'Brabant Wallon', notes:'FC<134 D+', dplus:300 },
  },
  S15: {
    renfo_a: null,
    renfo_b: null,
    tapis:   null,
    escaliers: null,
    velo:    null,
    sauna:   false, // ARRÊT J-11
    ven: { km:6, loc:'Forêt Soignes ou Chamonix', notes:'Très léger', dplus:0 },
    sam: { km:8, loc:'Forêt Soignes ou Chamonix', notes:'Léger + 3 strides', dplus:0 },
  },
  S16: {
    renfo_a: null,
    renfo_b: null,
    tapis:   null,
    escaliers: null,
    velo:    null,
    sauna:   false,
    ven: null,
    sam: null,
  },
};

// ── Jours spéciaux (overrides par date exacte) ─────────────────────────────────

const SPECIAL_DAYS = {
  // S1
  '2026-05-11': { lun_override: { matin_km:8, matin_fc_max:125, notes:'Footing léger pré-course' } },
  '2026-05-12': 'LIGHT_B',
  '2026-05-13': 'LIGHT_MER',
  '2026-05-14': 'REPOS_TOTAL',
  '2026-05-15': 'RACE_CHEVALIERS',
  '2026-05-16': 'RACE_CONT',
  '2026-05-17': 'REPOS',
  // S2
  '2026-05-18': 'MARCHE',
  '2026-05-19': 'VELO_RECUP',
  '2026-05-20': 'LIGHT_RUN',
  '2026-05-21': 'LIGHT_RUN',
  '2026-05-22': 'LIGHT_RUN_8',
  '2026-05-23': 'SAM_EASY_12',
  '2026-05-24': 'GRAVEL_RECUP',
  // S7 spécial
  '2026-06-26': 'REPOS',
  '2026-06-27': 'MARIAGE_1',
  '2026-06-28': 'REPOS',
  // S10 mariage
  '2026-07-18': 'MARIAGE_2',
  '2026-07-19': 'LIGHT_RUN_10',
  // S12 mariage
  '2026-08-01': 'MARIAGE_3',
  '2026-08-02': 'REPOS',
  // S15 affûtage
  '2026-08-17': 'LIGHT_A15',
  '2026-08-18': 'LIGHT_B15',
  '2026-08-19': 'LIGHT_MER15',
  '2026-08-20': 'LIGHT_JEU15',
  '2026-08-21': 'REPOS',
  '2026-08-22': 'LIGHT_8_STRIDES',
  '2026-08-23': 'VELO_LEGER',
  // S16 race week
  '2026-08-24': 'LIGHT_5',
  '2026-08-25': 'LIGHT_5_STRIDES',
  '2026-08-26': 'REPOS_TOTAL',
  '2026-08-27': 'REPOS_TOTAL',
  '2026-08-28': 'RACE_UTMB',
  '2026-08-29': 'RACE_CONT',
  '2026-08-30': 'RACE_CONT',
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

function getWeekForDate(dateStr) {
  return WEEKS.find(w => {
    const end = new Date(w.start);
    end.setDate(end.getDate() + 6);
    return dateStr >= w.start && dateStr <= end.toISOString().slice(0,10);
  }) || null;
}

function getWeekConfig(weekId) {
  return CONFIGS[weekId] || null;
}

// Day of week: 0=Mon, 1=Tue, ..., 6=Sun
function getDOW(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return (d.getDay() + 6) % 7; // Mon=0
}

function makeRun(km, zone, fc_min, fc_max, loc, notes, dplus) {
  return {
    slot: 'matin', sport: 'Course à pied', zone,
    desc: `${km}km ${zone} FC${fc_min ? ' '+fc_min+'-' : '<'}${fc_max}`,
    km, dplus_m: dplus || 0,
    duration_min: zone === 'Z1' ? Math.round(km * 6.5) : Math.round(km * 5.8),
    fc_min, fc_max, location: loc || 'Forêt de Soignes', notes,
  };
}

function makeRenfo(type, cfg, weekId) {
  if (!cfg) return null;
  return {
    slot: 'midi', sport: 'Renforcement', session_type: type,
    desc: cfg.desc, duration_min: cfg.duration,
    location: 'Aspria La Rasante', notes: 'Midi — sans matériel sauf Aspria',
  };
}

function makeEveningSoir(cfg, sauna) {
  const sessions = [];
  if (cfg.tapis) sessions.push({
    sport: 'Tapis', desc: `Tapis incliné ${cfg.tapis.pente} — ${cfg.tapis.dplus}m D+`,
    duration_min: cfg.tapis.duration, dplus_m: cfg.tapis.dplus,
  });
  if (cfg.escaliers) sessions.push({
    sport: 'Escalier', desc: `Escaliers — ${cfg.escaliers.dplus}m D+`,
    duration_min: cfg.escaliers.duration, dplus_m: cfg.escaliers.dplus,
  });
  if (cfg.velo) sessions.push({
    sport: 'Vélo intérieur', desc: `Vélo intérieur récup`,
    duration_min: cfg.velo.duration,
  });
  if (sauna) sessions.push({
    sport: 'Sauna', desc: 'Sauna 20min → douche froide 2min',
    duration_min: 20, notes: 'Protocole: 80-90°C → 500ml eau+électrolytes',
  });
  const totalDplus = sessions.reduce((s,x) => s + (x.dplus_m||0), 0);
  const totalDur = sessions.reduce((s,x) => s + (x.duration_min||0), 0);
  return {
    slot: 'soir', sport: 'Multiple', location: 'Aspria La Rasante',
    desc: sessions.map(s => s.desc).join(' + '),
    dplus_m: totalDplus, duration_min: totalDur,
    sessions, // sub-sessions detail
  };
}

function getTypeADay(week, cfg) {
  const sauna = cfg.sauna !== undefined ? cfg.sauna : week.sauna;
  const result = [];
  result.push(makeRun(11, 'Z2', 132, 145, 'Forêt de Soignes'));
  const isMonday = true; // TYPE A alternates renfo A/B; caller sets type
  return result;
}

// ── Main export ─────────────────────────────────────────────────────────────────

/**
 * Returns sessions for a given date as array of session objects.
 * Each session: { slot, sport, session_type, desc, km, dplus_m, duration_min, fc_min, fc_max, location, notes, sessions?, special? }
 */
function getSessionsForDate(dateStr) {
  const week = getWeekForDate(dateStr);
  if (!week) return [];

  const cfg = CONFIGS[week.id];
  const dow = getDOW(dateStr); // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  const special = SPECIAL_DAYS[dateStr];
  const sauna = cfg ? (cfg.sauna !== undefined ? cfg.sauna : week.sauna) : week.sauna;

  // Special day overrides
  if (special === 'RACE_CHEVALIERS') return [{ slot:'matin', sport:'Course à pied', session_type:'Compétition', desc:'🏆 CHEVALIERS — 157km / 4590m D+ — Départ 17h00', km:157, dplus_m:4590, fc_max:148, location:'Trail des Chevaliers', notes:'Stratégie conservative. Objectif B 20h. Décision A/B au km80 02h30.' }];
  if (special === 'RACE_UTMB') return [{ slot:'matin', sport:'Course à pied', session_type:'Compétition', desc:'🏔️ UTMB — 172km / 9761m D+ — Départ 17h00 Chamonix', km:172, dplus_m:9761, fc_max:148, location:'Chamonix', notes:'Objectif B 31h30-32h30. Partir trop vite = payer triple.' }];
  if (special === 'RACE_CONT') return [{ slot:'matin', sport:'Course à pied', session_type:'Compétition', desc:'Course en cours', notes:'Récupération après arrivée' }];
  if (special === 'MARIAGE_1' || special === 'MARIAGE_2' || special === 'MARIAGE_3') {
    const num = special.slice(-1);
    return [{ slot:'matin', sport:'Repos', desc:`💍 Mariage ${num} — repos complet`, notes:'Aucune séance.' }];
  }
  if (special === 'REPOS_TOTAL') return [{ slot:'matin', sport:'Repos', desc:'REPOS TOTAL — marche 20min max', notes:'Préparation logistique sac / nutrition' }];
  if (special === 'REPOS') return [{ slot:'matin', sport:'Repos', desc:'Repos', notes:'' }];
  if (special === 'MARCHE') return [{ slot:'matin', sport:'Repos', desc:'Marche 45min — pas de course', notes:'Récupération post-Chevaliers J+3' }];
  if (special === 'VELO_RECUP') return [{ slot:'matin', sport:'Vélo extérieur', desc:'Vélo route 1h30 plat Z1 FC<120', duration_min:90, fc_max:120, location:'Forêt Soignes' }];
  if (special === 'GRAVEL_RECUP') return [{ slot:'matin', sport:'Vélo extérieur', desc:'Gravel 2h récup plat — Forêt Soignes', duration_min:120, fc_max:125, location:'Forêt Soignes' }];
  if (special === 'VELO_LEGER') return [{ slot:'matin', sport:'Vélo extérieur', desc:'Vélo 1h très léger récup ou marche — Forêt Soignes / Chamonix', duration_min:60 }];
  if (special === 'LIGHT_RUN' || special === 'LIGHT_RUN_8') {
    const km = special === 'LIGHT_RUN_8' ? 8 : 7;
    return [{ slot:'matin', sport:'Course à pied', session_type:'Récup', desc:`Footing ${km}km Z1 FC<128`, km, fc_max:128, location:'Forêt Soignes', duration_min:Math.round(km*6.5) }];
  }
  if (special === 'LIGHT_RUN_10') return [{ slot:'matin', sport:'Course à pied', session_type:'Récup', desc:'Footing 10km très léger récup FC<126', km:10, fc_max:126, location:'Forêt Soignes', duration_min:65 }];
  if (special === 'SAM_EASY_12') return [{ slot:'matin', sport:'Course à pied', session_type:'Endurance', desc:'Sortie terrain 12km FC<130 — Forêt Soignes', km:12, fc_max:130, location:'Forêt Soignes', duration_min:75 }];
  if (special === 'LIGHT_5') return [{ slot:'matin', sport:'Course à pied', session_type:'Récup', desc:'Footing 5km très léger — Chamonix', km:5, fc_max:125, location:'Chamonix', duration_min:33 }];
  if (special === 'LIGHT_5_STRIDES') return [{ slot:'matin', sport:'Course à pied', session_type:'Activation', desc:'Footing 5km + 3 strides légers — Chamonix', km:5, fc_max:130, location:'Chamonix', duration_min:35 }];
  if (special === 'LIGHT_8_STRIDES') return [{ slot:'matin', sport:'Course à pied', session_type:'Activation', desc:'8km léger + 3 strides — Forêt Soignes ou Chamonix', km:8, fc_max:130, location:'Forêt Soignes / Chamonix', duration_min:53 }];

  // S15 affûtage special days
  if (special === 'LIGHT_A15') return [
    { slot:'matin', sport:'Course à pied', desc:'8km Z1 FC<125 — Forêt Soignes (ARRÊT SAUNA)', km:8, fc_max:125, duration_min:52, location:'Forêt Soignes' },
    { slot:'soir', sport:'Course à pied', desc:'6km Z1 FC<124 + 3 strides 80m', km:6, fc_max:124, duration_min:40, location:'Forêt Soignes' },
  ];
  if (special === 'LIGHT_B15') return [
    { slot:'matin', sport:'Course à pied', desc:'7km Z1 FC<124', km:7, fc_max:124, duration_min:46, location:'Forêt Soignes' },
    { slot:'soir', sport:'Course à pied', desc:'6km Z1 + 3 strides 80m', km:6, fc_max:124, duration_min:40, location:'quartier' },
  ];
  if (special === 'LIGHT_MER15') return [
    { slot:'matin', sport:'Course à pied', desc:'8km Z1 FC<125', km:8, fc_max:125, duration_min:52, location:'Forêt Soignes' },
    { slot:'midi', sport:'Repos', desc:'Mobilité hanches 15min', duration_min:15 },
    { slot:'soir', sport:'Course à pied', desc:'5km très léger', km:5, fc_max:120, duration_min:33, location:'quartier' },
  ];
  if (special === 'LIGHT_JEU15') return [
    { slot:'matin', sport:'Course à pied', desc:'7km Z1 + 4 strides 100m FC<140', km:7, fc_max:140, duration_min:46, location:'Forêt Soignes' },
  ];

  // No config = recovery week (S1-S3 partial)
  if (!cfg) {
    if (dow <= 3) return [{ slot:'matin', sport:'Course à pied', session_type:'Récup', desc:'Footing léger', km:7, fc_max:128, duration_min:46, location:'Forêt Soignes' }];
    if (dow === 4) return [{ slot:'matin', sport:'Course à pied', session_type:'Endurance', desc:'Sortie 14km', km:14, fc_max:133, duration_min:90, location:'Forêt Soignes' }];
    if (dow === 5) return [{ slot:'matin', sport:'Course à pied', session_type:'Endurance', desc:'Longue 15km', km:15, fc_max:132, duration_min:95, location:'Forêt Soignes' }];
    return [{ slot:'matin', sport:'Vélo extérieur', desc:'Gravel 2h récup', duration_min:120, location:'Forêt Soignes' }];
  }

  const sessions = [];

  // ── Lundi (0) ou Mercredi (2) = TYPE A ──
  if (dow === 0 || dow === 2) {
    // Matin
    sessions.push({
      slot:'matin', sport:'Course à pied', session_type:'Endurance',
      desc:'11km Z2 FC 132-145', km:11, dplus_m:0, duration_min:65, fc_min:132, fc_max:145,
      location:'Forêt de Soignes', zone:'Z2',
    });
    // Midi — Renfo A le lundi, Renfo B le mercredi
    const renfo = dow === 0
      ? (cfg.renfo_a ? makeRenfo('Force jambes', cfg.renfo_a, week.id) : null)
      : (cfg.renfo_b ? makeRenfo('Core & stabilité', cfg.renfo_b, week.id) : null);
    if (renfo) sessions.push(renfo);
    // Soir — Tapis + Escaliers + Vélo + Sauna
    if (cfg.tapis) sessions.push(makeEveningSoir(cfg, sauna));
  }

  // ── Mardi (1) ou Jeudi (3) = TYPE B ──
  else if (dow === 1 || dow === 3) {
    // Matin
    sessions.push({
      slot:'matin', sport:'Course à pied', session_type:'Récup',
      desc:'7km Z1 FC<128', km:7, dplus_m:0, duration_min:46, fc_max:128,
      location:'Forêt de Soignes', zone:'Z1',
    });
    // Soir — 7km Z2 + côtes + sauna
    const cotes = dow === 1 ? cfg.cotes_mar : cfg.cotes_jeu;
    const cotesSauna = sauna ? ' + Sauna 20min' : '';
    sessions.push({
      slot:'soir', sport:'Course à pied', session_type:'Côtes',
      desc:`7km Z2 FC 132-145 + ${cotes || 'sprints côtes'}${cotesSauna}`,
      km:7, dplus_m: dow === 1 ? 200 : 150, duration_min: sauna ? 100 : 75,
      fc_min:132, fc_max: dow === 1 ? 162 : 158,
      location: dow === 1 ? 'Rue des Floralies (330m domicile)' : 'Parc de Woluwe + Floralies',
      zone:'Z2-Z4', notes: cotes,
    });
  }

  // ── Vendredi (4) = Longue ──
  else if (dow === 4) {
    if (cfg.ven) {
      const v = cfg.ven;
      const isNight = v.night;
      const isUltra = v.ultralong;
      sessions.push({
        slot: isNight ? 'soir' : 'matin',
        sport:'Course à pied',
        session_type: isUltra ? 'Longue' : 'Endurance',
        desc: isNight
          ? `🌙 SORTIE NUIT ${v.km}km — départ 21h — FC<135 — ${v.loc}`
          : isUltra
          ? `⚡ ULTRA-LONGUE ${v.km}km ${v.dplus}m D+ — départ 17h-18h — FC<135 — ${v.loc}`
          : `Sortie longue ${v.km}km ${v.dplus > 0 ? v.dplus+'m D+ ' : ''}— ${v.notes} — ${v.loc}`,
        km: v.km, dplus_m: v.dplus || 0,
        duration_min: Math.round(v.km * (isUltra ? 9 : 7)),
        fc_max: isNight ? 135 : 140,
        location: v.loc,
        notes: v.notes,
        special: isNight ? 'night' : isUltra ? 'ultralong' : null,
      });
    } else {
      sessions.push({ slot:'matin', sport:'Repos', desc:'Repos / récup pré-mariage', notes:'' });
    }
  }

  // ── Samedi (5) ──
  else if (dow === 5) {
    if (cfg.sam) {
      const s = cfg.sam;
      sessions.push({
        slot:'matin', sport:'Course à pied', session_type:'Longue',
        desc:`Grande longue ${s.km}km ${s.dplus > 0 ? s.dplus+'m D+ ' : ''}— ${s.notes} — ${s.loc}`,
        km: s.km, dplus_m: s.dplus || 0,
        duration_min: Math.round(s.km * 7.5),
        fc_max:136, location: s.loc, notes: s.notes,
      });
    } else {
      sessions.push({ slot:'matin', sport:'Repos', desc:'Repos / mariage / récup', notes:'' });
    }
  }

  // ── Dimanche (6) = récup ──
  else if (dow === 6) {
    sessions.push({
      slot:'matin', sport:'Vélo extérieur',
      desc:'Gravel 2h récup — Forêt Soignes',
      duration_min:120, fc_max:128,
      location:'Forêt de Soignes', notes:'Récupération active',
    });
  }

  return sessions;
}

/**
 * Returns sessions for a date range (inclusive).
 */
function getSessionsForRange(fromDate, toDate) {
  const result = [];
  const cur = new Date(fromDate + 'T12:00:00');
  const end = new Date(toDate + 'T12:00:00');
  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const week = getWeekForDate(dateStr);
    const sessions = getSessionsForDate(dateStr);
    if (sessions.length > 0) {
      result.push({
        date: dateStr,
        week_id: week?.id,
        week_label: week?.label,
        phase: week?.phase,
        sauna: week?.sauna || false,
        sessions,
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

module.exports = { getSessionsForDate, getSessionsForRange, getWeekForDate, WEEKS, CONFIGS };
