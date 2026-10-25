/* =====================================================================
   ENQORA — Sistema visual
   Azul casi negro con profundidad, iluminación azul sutil y oro como acento.
   Superficies por capas; los bordes solo donde aportan estructura.
   ===================================================================== */
:root {
  /* Superficies */
  --bg: #050914;            /* fondo principal */
  --bg-2: #080f1d;          /* fondo secundario */
  --surface: #0b1425;       /* superficie elevada */
  --surface-2: #101d34;     /* superficie activa */
  --blue-deep: #14284a;
  --blue: #3c76d2;          /* azul luminoso: solo reflejos y foco */
  --blue-glow: rgba(60, 118, 210, 0.16);
  --hairline: rgba(154, 168, 189, 0.12);
  --hairline-strong: rgba(154, 168, 189, 0.2);

  /* Marca */
  --gold: #c6a66b;
  --gold-bright: #e5c783;
  --gold-deep: #9c7c45;
  --gold-soft: rgba(198, 166, 107, 0.12);

  /* Texto */
  --text: #f3f5fa;
  --text-2: #c3ccda;
  --text-3: #9aa8bd;

  /* Estados */
  --ok: #64c7ae;
  --ok-soft: rgba(100, 199, 174, 0.12);
  --danger: #e47c82;
  --danger-soft: rgba(228, 124, 130, 0.12);
  --warn: #e5c783;
  --warn-soft: rgba(229, 199, 131, 0.1);

  /* Compatibilidad con módulos anteriores (mismos nombres, nueva paleta) */
  --night: var(--bg-2);
  --night-deep: var(--bg);
  --night-raised: var(--surface);
  --night-line: var(--hairline-strong);
  --silver: var(--text-2);
  --silver-dim: var(--text-3);
  --ivory: var(--text);
  --verified: #2f7d6b;
  --verified-soft: var(--ok-soft);
  --risk: var(--danger);
  --risk-soft: var(--danger-soft);

  /* Forma */
  --radius: 16px;
  --radius-sm: 10px;
  --shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  --sheen: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0) 40%);
  --side-w: 264px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { scroll-behavior: smooth; scroll-padding-top: 24px; }

body {
  min-height: 100vh;
  background:
    radial-gradient(1100px 620px at 78% -14%, rgba(60, 118, 210, 0.13), transparent 62%),
    radial-gradient(700px 420px at 104% 34%, rgba(198, 166, 107, 0.05), transparent 60%),
    radial-gradient(900px 600px at -8% 112%, rgba(20, 40, 74, 0.55), transparent 62%),
    var(--bg);
  background-attachment: fixed;
  color: var(--text-2);
  font-family: var(--font-body), system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--gold-bright); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 3px; }

h1, h2, h3 { font-family: var(--font-brand), sans-serif; color: var(--text); margin: 0; letter-spacing: 0.005em; font-weight: 600; }

.icon { flex-shrink: 0; vertical-align: middle; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.block { display: block; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0; }
.muted-line { color: var(--text-3); font-size: 0.82rem; }
.text-warn, dd.text-warn { color: var(--warn); }
.text-ok, dd.text-ok { color: var(--ok); }
.mt-12 { margin-top: 12px; }
.pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0 0; color: var(--text-2); }
.optional { color: var(--text-3); font-weight: 400; }

.eyebrow {
  font-family: var(--font-brand), sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--gold);
}

/* ---------- Acceso (ingreso, registro, MFA) ---------- */
.auth-shell { min-height: 100vh; display: grid; place-items: center; padding: 32px 16px; }
.auth-card {
  width: 100%;
  max-width: 440px;
  background: var(--sheen), linear-gradient(180deg, rgba(16, 29, 52, 0.9), rgba(8, 15, 29, 0.96));
  border: 1px solid var(--hairline);
  border-radius: 20px;
  box-shadow: var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  padding: 34px 30px 30px;
  position: relative;
}
.auth-card::before {
  content: ""; position: absolute; left: 24px; right: 24px; top: -1px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(229, 199, 131, 0.55), transparent);
}
.auth-logo { display: block; width: 220px; max-width: 70%; height: auto; margin: 0 auto 22px; border-radius: 8px; }
.auth-title { font-size: 1.35rem; text-align: center; margin-bottom: 6px; }
.auth-sub { text-align: center; color: var(--text-3); margin: 0 0 24px; font-size: 0.92rem; }
.auth-foot { margin-top: 20px; text-align: center; font-size: 0.9rem; color: var(--text-3); }
.auth-foot p { margin: 6px 0; }

/* ---------- Campos ---------- */
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field label, .field-label { font-size: 0.84rem; color: var(--text-2); font-weight: 500; }
.field .hint { font-size: 0.78rem; color: var(--text-3); }
.input {
  width: 100%;
  background: rgba(5, 9, 20, 0.7);
  border: 1px solid var(--hairline-strong);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  color: var(--text);
  font: inherit;
  transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
}
.input::placeholder { color: rgba(154, 168, 189, 0.7); }
.input:hover { border-color: rgba(154, 168, 189, 0.32); }
.input:focus { outline: none; border-color: var(--blue); background: rgba(5, 9, 20, 0.9); box-shadow: 0 0 0 3px var(--blue-glow); }
.input.code { letter-spacing: 0.5em; text-align: center; font-size: 1.3rem; font-variant-numeric: tabular-nums; }
.input[readonly] { opacity: 0.75; cursor: default; }
textarea.input { resize: vertical; min-height: 72px; font-family: inherit; }
select.input {
  appearance: none; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, var(--gold) 50%), linear-gradient(135deg, var(--gold) 50%, transparent 50%);
  background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%;
  background-size: 5px 5px; background-repeat: no-repeat; padding-right: 36px;
}
select.input option { background: var(--bg-2); color: var(--text); }
.input-sm { padding: 8px 34px 8px 11px; font-size: 0.85rem; width: auto; }
.check-inline { display: inline-flex; align-items: center; gap: 8px; font-size: 0.84rem; color: var(--text-3); cursor: pointer; }
.check-inline input { accent-color: var(--gold); }

/* ---------- Botones ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%;
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid transparent;
  font: inherit; font-size: 0.92rem; font-weight: 600; letter-spacing: 0.02em;
  cursor: pointer; white-space: nowrap;
  transition: transform 0.12s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease, filter 0.2s ease;
}
.btn:hover { text-decoration: none; }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
.btn[aria-busy="true"] { cursor: progress; }
.btn .icon { margin-right: 0; }
.btn-gold {
  background: linear-gradient(180deg, #ecd29a 0%, var(--gold) 58%, #ad8d55 100%);
  color: #0a0f1a;
  box-shadow: 0 8px 24px rgba(198, 166, 107, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
.btn-gold:hover { filter: brightness(1.05); box-shadow: 0 10px 30px rgba(198, 166, 107, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.5); }
.btn-ghost { background: rgba(255, 255, 255, 0.02); border-color: var(--hairline-strong); color: var(--text); }
.btn-ghost:hover { background: rgba(60, 118, 210, 0.08); border-color: rgba(60, 118, 210, 0.45); }
.btn-danger { background: transparent; border-color: rgba(228, 124, 130, 0.45); color: #f0a8ac; }
.btn-danger:hover { background: var(--danger-soft); border-color: var(--danger); }
.btn-inline { width: auto; }
.btn-sm { padding: 8px 13px; font-size: 0.82rem; border-radius: 10px; }

.signout-link { background: none; border: 0; padding: 0; color: var(--gold-bright); cursor: pointer; font: inherit; }
.signout-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.icon-btn {
  display: inline-grid; place-items: center; width: 36px; height: 36px; border-radius: 10px;
  background: transparent; border: 1px solid transparent; color: var(--text-3); cursor: pointer; transition: all 0.2s;
}
.icon-btn span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
.icon-btn:hover { color: var(--text); border-color: var(--hairline-strong); background: rgba(255, 255, 255, 0.03); }

.link-arrow { display: inline-flex; align-items: center; gap: 6px; font-size: 0.84rem; color: var(--gold-bright); }
.link-arrow .icon { transition: transform 0.2s; }
.link-arrow:hover { text-decoration: none; }
.link-arrow:hover .icon { transform: translateX(3px); }

/* ---------- Mensajes ---------- */
.alert { border-radius: 12px; padding: 12px 16px; font-size: 0.88rem; margin-bottom: 16px; border: 1px solid; }
.alert-error { background: var(--danger-soft); border-color: rgba(228, 124, 130, 0.35); color: #f6c6c8; }
.alert-ok { background: var(--ok-soft); border-color: rgba(100, 199, 174, 0.3); color: #c4ece1; }
.alert-info { background: rgba(60, 118, 210, 0.07); border-color: rgba(60, 118, 210, 0.25); color: var(--text-2); }
.alert-warn { background: linear-gradient(90deg, rgba(198, 166, 107, 0.12), rgba(198, 166, 107, 0.04)); border-color: rgba(198, 166, 107, 0.35); color: #efdcb2; }
.alert-row { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
.alert-row > .icon { color: var(--gold-bright); margin-top: 2px; }
.alert-row > div:not(.actions-inline) { flex: 1 1 260px; }
.alert-row b { color: var(--text); }
.alert-row p { margin: 4px 0 0; }
.actions-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

/* Indicadores de estado: punto + texto, sin bloques de color */
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 0.74rem; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap; }
.badge-ok { background: var(--ok-soft); color: var(--ok); }
.badge-warn, .badge-gold { background: var(--gold-soft); color: var(--gold-bright); }
.badge-muted { background: rgba(154, 168, 189, 0.1); color: var(--text-3); }
.badge-risk { background: var(--danger-soft); color: var(--danger); }
.status {
  display: inline-flex; align-items: center; gap: 7px; font-size: 0.78rem; font-weight: 600; white-space: nowrap; color: var(--text-2);
}
.status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); flex: 0 0 auto; }
.status-ok { color: var(--ok); }
.status-ok::before { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
.status-gold, .status-warn { color: var(--gold-bright); }
.status-gold::before { background: var(--gold); box-shadow: 0 0 0 3px var(--gold-soft); }
.status-warn::before { background: var(--gold-bright); box-shadow: 0 0 10px rgba(229, 199, 131, 0.65); }
.status-risk { color: var(--danger); }
.status-risk::before { background: var(--danger); }
.status-muted { color: var(--text-3); }
.tag { font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-3); }
.count {
  display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; margin-left: 8px; border-radius: 999px;
  background: var(--gold-soft); color: var(--gold-bright); font-family: var(--font-body), sans-serif; font-size: 0.74rem; font-weight: 700; vertical-align: middle;
}

/* ---------- Medidor de contraseña y MFA ---------- */
.meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 4px; }
.meter span { height: 4px; border-radius: 2px; background: var(--hairline-strong); }
.meter[data-level="1"] span:nth-child(-n+1) { background: var(--danger); }
.meter[data-level="2"] span:nth-child(-n+2) { background: var(--gold-deep); }
.meter[data-level="3"] span:nth-child(-n+3) { background: var(--gold); }
.meter[data-level="4"] span { background: var(--ok); }
.qr-box { background: #fff; border-radius: 12px; padding: 12px; width: 212px; height: 212px; margin: 0 auto 14px; }
.qr-box img { width: 100%; height: 100%; display: block; }
.secret {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; word-break: break-all; text-align: center;
  background: var(--bg); border: 1px dashed var(--hairline-strong); border-radius: 8px; padding: 8px 10px; color: var(--text); margin-bottom: 18px;
}
.steps { margin: 0 0 18px; padding-left: 20px; color: var(--text-3); font-size: 0.88rem; }
.steps li { margin-bottom: 4px; }

/* =====================================================================
   Estructura de la app: navegación lateral propia + contenido
   ===================================================================== */
.shell { min-height: 100vh; display: grid; grid-template-columns: var(--side-w) minmax(0, 1fr); }

.side {
  position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 22px;
  padding: 22px 16px 16px;
  background:
    radial-gradient(260px 220px at 0% 0%, rgba(60, 118, 210, 0.12), transparent 70%),
    linear-gradient(180deg, rgba(11, 20, 37, 0.92), rgba(5, 9, 20, 0.96));
  border-right: 1px solid var(--hairline);
  overflow-y: auto;
}
.brand-mark { display: flex; align-items: center; gap: 10px; color: var(--text); padding: 2px 8px; }
.brand-mark:hover { text-decoration: none; }
.brand-mark img { width: 34px; height: 34px; border-radius: 9px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5); }
.brand-mark b { font-family: var(--font-brand), sans-serif; letter-spacing: 0.26em; font-size: 0.98rem; font-weight: 600; }
.brand-mark b em { font-style: normal; color: var(--gold); }

.side-label, .side-group {
  display: block; font-family: var(--font-brand), sans-serif; text-transform: uppercase; letter-spacing: 0.22em;
  font-size: 0.6rem; font-weight: 600; color: rgba(154, 168, 189, 0.7); padding: 0 10px 8px;
}
.company-switch {
  display: flex; align-items: center; gap: 11px; padding: 10px; border-radius: 14px; color: var(--text);
  background: rgba(16, 29, 52, 0.55); border: 1px solid var(--hairline); transition: border-color 0.2s, background 0.2s;
}
.company-switch:hover { text-decoration: none; border-color: rgba(198, 166, 107, 0.35); background: rgba(16, 29, 52, 0.85); }
.company-switch-text { display: flex; flex-direction: column; min-width: 0; }
.company-switch-text b { font-size: 0.88rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.company-switch-text small { font-size: 0.74rem; color: var(--text-3); }
.monogram {
  flex: 0 0 auto; width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
  font-family: var(--font-brand), sans-serif; font-weight: 600; font-size: 0.82rem; letter-spacing: 0.04em; color: var(--gold-bright);
  background: linear-gradient(145deg, #1a2d4f, #0b1425); border: 1px solid rgba(198, 166, 107, 0.28);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.monogram-lg { width: 56px; height: 56px; border-radius: 16px; font-size: 1.1rem; }

.side-nav { display: flex; flex-direction: column; gap: 18px; flex: 1; }
.side-section { display: flex; flex-direction: column; gap: 2px; }
.nav-link {
  position: relative; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 11px;
  color: var(--text-3); font-size: 0.92rem; font-weight: 500; transition: color 0.2s, background 0.2s;
}
.nav-link .icon { color: currentColor; opacity: 0.85; }
.nav-link:hover { color: var(--text); background: rgba(255, 255, 255, 0.03); text-decoration: none; }
.nav-link.is-active {
  color: var(--text);
  background: linear-gradient(90deg, rgba(60, 118, 210, 0.2), rgba(60, 118, 210, 0.04) 70%, transparent);
}
.nav-link.is-active::before {
  content: ""; position: absolute; left: -16px; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  box-shadow: 0 0 12px rgba(229, 199, 131, 0.55);
}
.nav-link.is-active .icon { color: var(--gold-bright); opacity: 1; }
.nav-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gold-bright); box-shadow: 0 0 10px rgba(229, 199, 131, 0.8); margin-left: auto; }
.nav-link-gold { color: var(--gold-bright) !important; }

.side-foot {
  display: flex; align-items: center; gap: 10px; padding: 12px 8px 4px; border-top: 1px solid var(--hairline);
}
.avatar {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 30% 25%, #24406f, #0b1425); border: 1px solid var(--hairline-strong);
  font-family: var(--font-brand), sans-serif; font-size: 0.84rem; color: var(--text);
}
.side-user { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.side-user b { font-size: 0.8rem; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side-user small { font-size: 0.72rem; color: var(--text-3); }

.mobile-top, .bottom-nav { display: none; }

.app-main { width: 100%; max-width: 1240px; margin: 0 auto; padding: 34px 40px 72px; min-width: 0; }

/* Teléfono y tablet: barra superior + barra inferior compacta */
@media (max-width: 960px) {
  .shell { grid-template-columns: 1fr; }
  .side { display: none; }
  .mobile-top {
    position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    background: rgba(5, 9, 20, 0.86); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--hairline);
  }
  .mobile-top .brand-mark { padding: 0; }
  .mobile-top .brand-mark b { font-size: 0.86rem; letter-spacing: 0.22em; }
  .company-chip {
    margin-left: auto; max-width: 44vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.78rem; color: var(--text-2); padding: 6px 12px; border-radius: 999px;
    border: 1px solid var(--hairline-strong); background: rgba(16, 29, 52, 0.6);
  }
  .company-chip:hover { text-decoration: none; border-color: rgba(198, 166, 107, 0.4); }
  .bottom-nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: flex; justify-content: space-around;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: rgba(5, 9, 20, 0.92); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-top: 1px solid var(--hairline);
  }
  .bottom-link {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 2px; border-radius: 12px;
    color: var(--text-3); font-size: 0.68rem; font-weight: 500;
  }
  .bottom-link:hover { text-decoration: none; color: var(--text); }
  .bottom-link.is-active { color: var(--gold-bright); background: rgba(60, 118, 210, 0.1); }
  .bottom-icon { position: relative; display: inline-flex; }
  .bottom-icon .nav-dot { position: absolute; top: -2px; right: -5px; margin: 0; }
  .app-main { padding: 22px 16px calc(96px + env(safe-area-inset-bottom)); }
}

/* =====================================================================
   Páginas: encabezado, indicadores y superficies
   ===================================================================== */
.page > * + * { margin-top: 22px; }
.stack > * + * { margin-top: 16px; }

.hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; padding-bottom: 10px; }
.hero-main { min-width: 0; flex: 1 1 420px; }
.hero h1 { font-size: clamp(1.6rem, 1.2rem + 1.4vw, 2.25rem); line-height: 1.15; margin-top: 10px; letter-spacing: -0.01em; }
.hero-lead { color: var(--text-3); margin: 10px 0 0; max-width: 640px; }
.hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.hero-facts { display: flex; flex-wrap: wrap; gap: 8px 30px; margin: 16px 0 0; }
.hero-facts div { display: flex; flex-direction: column; gap: 2px; }
.hero-facts dt { font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.hero-facts dd { margin: 0; color: var(--text); font-size: 0.92rem; }

/* Indicadores: una franja continua, no tarjetas idénticas */
.kpis {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  border-radius: var(--radius); overflow: hidden;
  background: var(--sheen), linear-gradient(90deg, rgba(16, 29, 52, 0.75), rgba(11, 20, 37, 0.55));
  border: 1px solid var(--hairline);
}
.kpi { position: relative; padding: 18px 22px; display: flex; flex-direction: column; gap: 4px; }
.kpi + .kpi { border-left: 1px solid var(--hairline); }
.kpi span { font-size: 0.76rem; color: var(--text-3); }
.kpi b { font-family: var(--font-brand), sans-serif; font-size: 1.9rem; font-weight: 600; color: var(--text); line-height: 1.1; font-variant-numeric: tabular-nums; }
.kpi-gold b { color: var(--gold-bright); }
.kpi-gold::after { content: ""; position: absolute; left: 22px; right: 22px; bottom: 0; height: 2px; background: linear-gradient(90deg, var(--gold), transparent); }

/* Superficies */
.panel {
  position: relative; border-radius: var(--radius); padding: 22px 24px;
  background: var(--sheen), linear-gradient(180deg, rgba(16, 29, 52, 0.62), rgba(11, 20, 37, 0.5));
  border: 1px solid var(--hairline);
}
.panel-quiet { background: rgba(11, 20, 37, 0.42); }
.panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.panel h2, .panel-title { font-size: 1.02rem; }
.panel-title { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
.panel-title .icon { color: var(--gold); }
.empty-inline { color: var(--text-3); font-size: 0.88rem; margin: 6px 0 0; }
.empty-inline p { margin: 0 0 8px; }
.welcome { text-align: center; padding: 48px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.welcome .icon { color: var(--gold); }
.welcome p { color: var(--text-3); max-width: 520px; margin: 0; }
.note, .soon { color: var(--text-3); font-size: 0.8rem; margin: 14px 0 0; display: flex; align-items: center; gap: 8px; }
.soon .icon { color: var(--gold); }

/* Tarjeta clásica (pantallas internas): misma superficie del sistema */
.card {
  position: relative; border-radius: var(--radius); padding: 22px;
  background: var(--sheen), linear-gradient(180deg, rgba(16, 29, 52, 0.62), rgba(11, 20, 37, 0.5));
  border: 1px solid var(--hairline);
}
.card h2 { font-size: 1.02rem; margin-bottom: 10px; }
.card p { margin: 0 0 12px; color: var(--text-3); font-size: 0.9rem; }
.card .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--hairline); font-size: 0.9rem; }
.card .row:first-of-type { border-top: 0; }
.card-title { display: flex; align-items: center; gap: 10px; }
.card-title .icon { color: var(--gold); }
.card-narrow { max-width: 560px; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.grid-wide { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: start; }
.narrow { max-width: 640px; }
.sub-title { font-size: 0.92rem; margin: 22px 0 6px; }
.empty { text-align: center; padding: 40px 20px; }
.empty .btn { margin-top: 6px; }
.actions-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto; padding-top: 14px; }

.page-head { margin-bottom: 4px; }
.page-head h1 { font-size: clamp(1.5rem, 1.2rem + 1vw, 2rem); margin-top: 10px; letter-spacing: -0.01em; }
.page-head p { color: var(--text-3); margin: 8px 0 0; }
.page-head-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }

/* =====================================================================
   Centro de control
   ===================================================================== */
.control-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr); gap: 20px; align-items: start; }
.control-main, .control-side { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

.case-rows { list-style: none; margin: 0; padding: 0; }
.case-row {
  display: flex; justify-content: space-between; gap: 18px; padding: 14px 12px; margin: 0 -12px;
  border-radius: 12px; color: var(--text-2); border-top: 1px solid var(--hairline); transition: background 0.2s;
}
.case-rows li:first-child .case-row { border-top: 0; }
.case-row:hover { text-decoration: none; background: rgba(60, 118, 210, 0.06); }
.case-row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.case-row-main b { color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
.case-row-top { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.case-row-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: 0 0 auto; }
.case-folio { color: var(--gold); font-size: 0.78rem; }
.case-next { color: var(--text-3); font-size: 0.8rem; }
.needs-you .case-next { color: var(--gold-bright); }

.action-list { list-style: none; margin: 0; padding: 0; }
.action-list li { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--hairline); }
.action-list li:first-child { border-top: 0; padding-top: 2px; }
.action-mark {
  flex: 0 0 auto; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center;
  color: var(--text-3); background: rgba(154, 168, 189, 0.08);
}
.action-gold { color: var(--gold-bright); background: var(--gold-soft); }
.action-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.action-text b { color: var(--text); font-weight: 500; font-size: 0.92rem; }
.action-text small { color: var(--text-3); font-size: 0.78rem; }

.check-list { list-style: none; margin: 0 0 14px; padding: 0; }
.check-list li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 0; font-size: 0.88rem; border-top: 1px solid var(--hairline); }
.check-list li:first-child { border-top: 0; }
.check-list .is-ok .icon { color: var(--ok); }
.check-list .is-warn { color: var(--gold-bright); }

.feed { list-style: none; margin: 0; padding: 0; position: relative; }
.feed li { position: relative; display: flex; gap: 12px; padding: 0 0 14px; }
.feed li:last-child { padding-bottom: 0; }
.feed li:not(:last-child)::after { content: ""; position: absolute; left: 4px; top: 14px; bottom: 0; width: 1px; background: var(--hairline-strong); }
.feed-dot { flex: 0 0 auto; width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: var(--blue-deep); border: 1px solid rgba(60, 118, 210, 0.6); }
.feed .is-warn .feed-dot { background: var(--gold-bright); border-color: var(--gold-bright); box-shadow: 0 0 10px rgba(229, 199, 131, 0.6); }
.feed-text { display: flex; flex-direction: column; min-width: 0; }
.feed-text b { color: var(--text); font-weight: 500; font-size: 0.88rem; }
.feed-text small { color: var(--text-3); font-size: 0.76rem; }
.feed-text small a { color: var(--gold); }

.quick-links { display: flex; flex-direction: column; }
.quick-links a { display: flex; align-items: center; gap: 10px; padding: 9px 0; color: var(--text-2); font-size: 0.88rem; border-top: 1px solid var(--hairline); }
.quick-links a:first-child { border-top: 0; padding-top: 0; }
.quick-links a .icon { color: var(--gold); }
.quick-links a:hover { color: var(--text); text-decoration: none; }

/* =====================================================================
   Casos
   ===================================================================== */
.segments { display: flex; gap: 8px; flex-wrap: wrap; }
.segment {
  display: inline-flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 12px;
  border: 1px solid var(--hairline); background: rgba(11, 20, 37, 0.5); color: var(--text-3); font-size: 0.86rem;
  transition: all 0.2s;
}
.segment b { font-family: var(--font-brand), sans-serif; font-weight: 600; color: var(--text-2); font-variant-numeric: tabular-nums; }
.segment:hover { text-decoration: none; color: var(--text); border-color: var(--hairline-strong); }
.segment.is-active { color: var(--text); border-color: rgba(60, 118, 210, 0.5); background: linear-gradient(180deg, rgba(60, 118, 210, 0.16), rgba(60, 118, 210, 0.05)); }
.segment.has-gold b { color: var(--gold-bright); }

.case-group > * + * { margin-top: 12px; }
.group-title { display: flex; align-items: center; gap: 10px; font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-3); font-weight: 600; }
.group-title span { font-family: var(--font-body), sans-serif; letter-spacing: 0; color: var(--text-3); font-weight: 500; }
.group-title::after { content: ""; flex: 1; height: 1px; background: var(--hairline); }

.case-table { list-style: none; margin: 0; padding: 0; border-radius: var(--radius); border: 1px solid var(--hairline); background: rgba(11, 20, 37, 0.45); overflow: hidden; }
.case-table li + li { border-top: 1px solid var(--hairline); }
.case-line {
  position: relative; display: grid; align-items: center; gap: 18px; padding: 16px 20px; color: var(--text-2);
  grid-template-columns: 128px minmax(0, 1.6fr) minmax(0, 1.25fr) minmax(0, 0.9fr) 110px 18px;
  transition: background 0.2s;
}
.case-line:hover { text-decoration: none; background: rgba(60, 118, 210, 0.06); }
.case-line.needs-you::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 2px; background: var(--gold); box-shadow: 0 0 10px rgba(198, 166, 107, 0.6); }
.cl-id { color: var(--gold); font-size: 0.8rem; }
.cl-main, .cl-state, .cl-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cl-main b { color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
.cl-main small, .cl-meta small { color: var(--text-3); font-size: 0.74rem; }
.cl-meta small { letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.64rem; }
.cl-meta span { color: var(--text-2); font-size: 0.86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-go { color: var(--text-3); transition: transform 0.2s, color 0.2s; }
.case-line:hover .cl-go { color: var(--gold-bright); transform: translateX(3px); }

/* =====================================================================
   Empresas: ficha empresarial
   ===================================================================== */
.company-sheets { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.company-sheet {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px 26px; align-items: center;
  padding: 22px 24px; border-radius: 18px; border: 1px solid var(--hairline);
  background: var(--sheen), linear-gradient(100deg, rgba(16, 29, 52, 0.7), rgba(11, 20, 37, 0.45));
}
.company-sheet.is-active { border-color: rgba(198, 166, 107, 0.3); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(198, 166, 107, 0.06); }
.company-sheet.is-active::before { content: ""; position: absolute; left: 24px; right: 24px; top: -1px; height: 1px; background: linear-gradient(90deg, transparent, rgba(229, 199, 131, 0.6), transparent); }
.sheet-id { display: flex; align-items: center; gap: 16px; min-width: 0; }
.sheet-name { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sheet-name h2 { font-size: 1.2rem; overflow-wrap: anywhere; }
.sheet-tags { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.sheet-facts { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 22px; margin: 0; padding-top: 18px; border-top: 1px solid var(--hairline); }
.sheet-facts div { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-left: 14px; border-left: 1px solid var(--hairline); }
.sheet-facts dt { font-size: 0.64rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.sheet-facts dd { margin: 0; color: var(--text); font-size: 0.9rem; overflow-wrap: anywhere; }
.sheet-actions { grid-column: 2; grid-row: 1; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.hero-facts dd.text-ok, .sheet-facts dd.text-ok { color: var(--ok); }
.hero-facts dd.text-warn, .sheet-facts dd.text-warn { color: var(--warn); }

/* =====================================================================
   Seguridad: centro de seguridad
   ===================================================================== */
.shield-status {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-radius: var(--radius); overflow: hidden;
  border: 1px solid var(--hairline); background: var(--sheen), linear-gradient(90deg, rgba(16, 29, 52, 0.75), rgba(11, 20, 37, 0.55));
}
.shield-item { display: flex; align-items: center; gap: 12px; padding: 16px 20px; }
.shield-item + .shield-item { border-left: 1px solid var(--hairline); }
.shield-item > .icon { color: var(--text-3); }
.shield-item.is-ok > .icon { color: var(--ok); }
.shield-item.is-warn > .icon { color: var(--gold-bright); }
.shield-item span { display: flex; flex-direction: column; }
.shield-item small { font-size: 0.72rem; color: var(--text-3); }
.shield-item b { color: var(--text); font-weight: 600; font-size: 0.95rem; }

.anchor-nav { display: flex; gap: 6px; flex-wrap: wrap; }
.anchor-nav a { padding: 7px 12px; border-radius: 999px; font-size: 0.8rem; color: var(--text-3); border: 1px solid var(--hairline); }
.anchor-nav a:hover { text-decoration: none; color: var(--text); border-color: rgba(60, 118, 210, 0.45); }

.settings { border-radius: var(--radius); border: 1px solid var(--hairline); background: rgba(11, 20, 37, 0.42); }
.setting { display: grid; grid-template-columns: minmax(200px, 300px) minmax(0, 1fr); gap: 28px; padding: 26px 28px; }
.setting + .setting { border-top: 1px solid var(--hairline); }
.setting-head h2 { display: flex; align-items: center; gap: 9px; font-size: 1rem; }
.setting-head h2 .icon { color: var(--gold); }
.setting-head p { margin: 8px 0 0; color: var(--text-3); font-size: 0.85rem; }
.setting-body { min-width: 0; }
.setting-form { max-width: 460px; }
.setting-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.facts { margin: 0; display: flex; flex-direction: column; }
.facts div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-top: 1px solid var(--hairline); }
.facts div:first-child { border-top: 0; padding-top: 0; }
.facts dt { color: var(--text-3); font-size: 0.88rem; }
.facts dd { margin: 0; color: var(--text); text-align: right; overflow-wrap: anywhere; }

.rows { list-style: none; margin: 0; padding: 0; }
.row-item { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--hairline); }
.row-item:first-child { border-top: 0; padding-top: 0; }
.row-icon { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; color: var(--text-3); background: rgba(154, 168, 189, 0.07); }
.row-item.is-current .row-icon { color: var(--ok); background: var(--ok-soft); }
.row-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.row-text b { color: var(--text); font-weight: 500; font-size: 0.92rem; }
.row-text small { color: var(--text-3); font-size: 0.78rem; overflow-wrap: anywhere; }
.feed-wide { max-height: 440px; overflow-y: auto; padding-right: 6px; }

/* =====================================================================
   Componentes de pantallas internas (empresas, casos, Centro de Mando)
   ===================================================================== */
.company-card { display: flex; flex-direction: column; }
.company-card.is-active { border-color: rgba(198, 166, 107, 0.35); }
.company-card-head { display: flex; gap: 6px; margin-bottom: 10px; }
.company-card h2 { margin-bottom: 2px; }

.member-list { list-style: none; margin: 8px 0 0; padding: 0; }
.member { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 0; border-top: 1px solid var(--hairline); }
.member:first-child { border-top: 0; }
.member-who { display: flex; flex-direction: column; min-width: 0; }
.member-who b { color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
.member-who span { font-size: 0.84rem; overflow-wrap: anywhere; }
.member-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.inline-form { display: flex; gap: 6px; align-items: center; }
.copy-row { display: flex; gap: 8px; }
.copy-row .input { font-size: 0.78rem; }

.audit-list { list-style: none; margin: 0; padding: 0; font-size: 0.86rem; }
.audit-list li { display: grid; grid-template-columns: 130px 1fr; gap: 10px; padding: 9px 0; border-top: 1px solid var(--hairline); }
.audit-list li:first-child { border-top: 0; }
.audit-list b { color: var(--text); font-weight: 600; }
.audit-when { color: var(--text-3); font-size: 0.78rem; }

/* Carga: reloj ENQORA */
.loading-state { min-height: 40vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--text-3); font-size: 0.9rem; }
.loading-clock .lc-ring { fill: none; stroke: var(--hairline-strong); stroke-width: 2.5; }
.loading-clock .lc-arc { fill: none; stroke: var(--gold); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 40 126; transform-origin: 24px 24px; animation: enq-spin 1.4s linear infinite; }
.loading-clock .lc-hand { stroke: var(--text-2); stroke-width: 2; stroke-linecap: round; transform-origin: 24px 24px; }
.loading-clock .lc-minute { animation: enq-spin 1.4s linear infinite; }
.loading-clock .lc-hour { animation: enq-spin 8.4s linear infinite; }
.loading-clock .lc-pin { fill: var(--gold); }
@keyframes enq-spin { to { transform: rotate(360deg); } }

/* Lista de casos (vistas internas) */
.case-list { list-style: none; margin: 4px 0 0; padding: 0; }
.case-item { display: grid; grid-template-columns: 130px 1fr auto; gap: 14px; align-items: center; padding: 12px 8px; border-top: 1px solid var(--hairline); color: var(--text-2); border-radius: 8px; }
.case-list li:first-child .case-item { border-top: 0; }
.case-item:hover { background: rgba(60, 118, 210, 0.05); text-decoration: none; }
.case-main { display: flex; flex-direction: column; min-width: 0; }
.case-main b { color: var(--text); font-weight: 600; overflow-wrap: anywhere; }

/* Ficha de caso */
.case-head-badges { display: flex; gap: 8px; flex-wrap: wrap; }
.case-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: 18px; align-items: start; }
.flow { list-style: none; margin: 0; padding: 16px 18px; display: flex; gap: 6px; overflow-x: auto; background: rgba(11, 20, 37, 0.55); border: 1px solid var(--hairline); border-radius: var(--radius); }
.flow li { flex: 1 0 96px; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; position: relative; }
.flow li::before { content: ""; position: absolute; top: 6px; left: -50%; width: 100%; height: 2px; background: var(--hairline-strong); z-index: 0; }
.flow li:first-child::before { display: none; }
.flow-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--hairline-strong); background: var(--bg); position: relative; z-index: 1; }
.flow-label { font-size: 0.72rem; color: var(--text-3); line-height: 1.3; }
.flow li.done .flow-dot { background: var(--ok); border-color: var(--ok); }
.flow li.done::before, .flow li.current::before { background: rgba(100, 199, 174, 0.6); }
.flow li.current .flow-dot { border-color: var(--gold); background: var(--gold); box-shadow: 0 0 0 4px var(--gold-soft); }
.flow li.current .flow-label { color: var(--gold-bright); font-weight: 600; }

.timeline { list-style: none; margin: 0 0 14px; padding: 0; }
.tl-item { padding: 10px 0 10px 14px; border-left: 2px solid var(--hairline-strong); margin-left: 4px; font-size: 0.88rem; }
.tl-item.tl-msg { border-left-color: rgba(198, 166, 107, 0.6); }
.tl-item.tl-internal { border-left-color: rgba(60, 118, 210, 0.5); background: rgba(60, 118, 210, 0.04); }
.tl-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; color: var(--text-3); }
.tl-meta b { color: var(--text); font-weight: 600; }
.tl-when { margin-left: auto; font-size: 0.76rem; }
.comment-form { border-top: 1px solid var(--hairline); padding-top: 14px; }
.comment-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.mini-form { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--hairline); }
.mini-form .input-sm { width: 100%; }
.mini-form .inline-form .input-sm { width: auto; flex: 1; }

.doc-list, .task-list { list-style: none; margin: 0; padding: 0; }
.doc-list li { display: flex; flex-direction: column; padding: 9px 0; border-top: 1px solid var(--hairline); overflow-wrap: anywhere; }
.doc-list li:first-child { border-top: 0; }
.upload { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.upload-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.upload .hint { font-size: 0.76rem; color: var(--text-3); }
.is-busy { opacity: 0.6; pointer-events: none; }
.task { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 9px 0; border-top: 1px solid var(--hairline); }
.task:first-child { border-top: 0; }
.task > div { display: flex; flex-direction: column; min-width: 0; }
.task b { color: var(--text); font-weight: 500; font-size: 0.9rem; }
.task-hecha b { text-decoration: line-through; color: var(--text-3); }

/* Centro de Mando */
.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); border-radius: var(--radius); overflow: hidden; border: 1px solid var(--hairline); background: var(--sheen), linear-gradient(90deg, rgba(16, 29, 52, 0.75), rgba(11, 20, 37, 0.55)); }
.stat { padding: 16px 20px; }
.stat + .stat { border-left: 1px solid var(--hairline); }
.stat span { display: block; font-size: 0.76rem; color: var(--text-3); }
.stat b { font-family: var(--font-brand), sans-serif; font-size: 1.7rem; font-weight: 600; color: var(--text); }
.stat-warn b { color: var(--gold-bright); }
.tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.tab { padding: 8px 14px; border-radius: 12px; border: 1px solid var(--hairline); background: rgba(11, 20, 37, 0.5); color: var(--text-3); font-size: 0.86rem; transition: all 0.2s; }
.tab:hover { text-decoration: none; color: var(--text); border-color: var(--hairline-strong); }
.tab.is-active { color: var(--text); border-color: rgba(60, 118, 210, 0.5); background: linear-gradient(180deg, rgba(60, 118, 210, 0.16), rgba(60, 118, 210, 0.05)); }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.table th { text-align: left; font-weight: 600; color: var(--text-3); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.14em; padding: 10px 12px; border-bottom: 1px solid var(--hairline); }
.table td { padding: 13px 12px; border-bottom: 1px solid var(--hairline); vertical-align: top; }
.table tr:last-child td { border-bottom: 0; }
.table tbody tr { transition: background 0.2s; }
.table tbody tr:hover { background: rgba(60, 118, 210, 0.05); }
.table a { color: var(--text); }

/* =====================================================================
   Adaptación: notebook, tablet y teléfono
   ===================================================================== */
@media (max-width: 1180px) {
  .case-line { grid-template-columns: 116px minmax(0, 1.6fr) minmax(0, 1.2fr) 110px 18px; }
  .case-line .cl-meta:first-of-type { display: none; }
}

@media (max-width: 1060px) {
  .control-grid { grid-template-columns: 1fr; }
  .setting { grid-template-columns: 1fr; gap: 14px; }
}

@media (max-width: 900px) {
  .case-layout { grid-template-columns: 1fr; }
  .case-item { grid-template-columns: 1fr; gap: 4px; }
}

@media (max-width: 720px) {
  .hero { align-items: flex-start; }
  .hero-actions { width: 100%; }
  .hero-actions .btn { flex: 1; }
  .kpis, .shield-status { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi:nth-child(3), .shield-item:nth-child(3) { border-left: 0; }
  .kpi:nth-child(n+3), .shield-item:nth-child(n+3) { border-top: 1px solid var(--hairline); }
  .kpi { padding: 14px 16px; }
  .kpi b { font-size: 1.55rem; }
  .shield-item { padding: 14px 16px; }
  .panel, .card { padding: 18px; }
  .case-row { flex-direction: column; gap: 8px; }
  .case-row-side { flex-direction: row; align-items: center; justify-content: space-between; }
  .case-line { grid-template-columns: minmax(0, 1fr) 18px; gap: 6px 12px; padding: 14px 16px; }
  .case-line .cl-id { grid-column: 1; }
  .case-line .cl-main, .case-line .cl-state { grid-column: 1; }
  .case-line .cl-meta { display: none; }
  .case-line .cl-go { grid-column: 2; grid-row: 1 / span 3; }
  .company-sheet { grid-template-columns: 1fr; gap: 18px; padding: 18px; }
  .sheet-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sheet-actions { grid-column: 1; grid-row: auto; justify-content: flex-start; }
  .setting { padding: 20px 18px; }
  .facts div { flex-direction: column; gap: 2px; }
  .facts dd { text-align: left; }
  .row-item { flex-wrap: wrap; }
  .row-text { flex: 1 1 calc(100% - 50px); }
  .row-item form, .row-item > .status { margin-left: 50px; }
  .grid-wide { grid-template-columns: 1fr; }
  .audit-list li { grid-template-columns: 1fr; gap: 2px; }
  .stat + .stat { border-left: 0; }
  .auth-card { padding: 26px 18px 22px; }
}

/* Accesibilidad: respetar la preferencia de movimiento reducido del dispositivo */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Foco visible para teclado en todo el sistema */
:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: 6px; }

/* ---------- Etapa 5: aprobaciones y autorizaciones ---------- */
.tab { display: inline-flex; align-items: center; gap: 6px; }
.tab-count {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; display: inline-grid; place-items: center;
  background: var(--gold); color: var(--night-deep); font-size: 0.7rem; font-weight: 700;
}
.auth-list, .approval-list { list-style: none; margin: 8px 0 0; padding: 0; }
.auth-item, .approval { display: flex; flex-direction: column; gap: 4px; padding: 14px 0; border-top: 1px solid var(--night-line); }
.auth-item:first-child, .approval:first-child { border-top: 0; padding-top: 4px; }
.auth-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.auth-head b { color: var(--ivory); }
.auth-pendiente { border-left: 2px solid var(--gold); padding-left: 12px; }
.auth-scope { margin: 2px 0 4px; }
.auth-meta { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; margin: 4px 0 0; font-size: 0.82rem; }
.auth-meta dt { color: var(--silver-dim); }
.auth-meta dd { margin: 0; color: var(--silver); overflow-wrap: anywhere; }
.auth-decide { display: flex; flex-direction: column; gap: 4px; }
.auth-confirm { align-items: flex-start; color: var(--silver); line-height: 1.45; }
.auth-confirm input { margin-top: 3px; flex: 0 0 auto; }
.auth-reject summary, .auth-new summary { cursor: pointer; color: var(--gold-bright); font-size: 0.86rem; margin-top: 8px; }
.auth-reject[open] summary, .auth-new[open] summary { margin-bottom: 0; }
.auth-legal { margin: 14px 0 0; padding: 10px 12px; border-radius: 10px; background: rgba(217, 224, 234, 0.04); font-size: 0.78rem; line-height: 1.5; color: var(--silver-dim); }
.approval-note { border-left: 2px solid var(--night-line); padding-left: 10px; }
.approval-pendiente { border-left: 2px solid var(--gold); padding-left: 12px; }
.approval .inline-form { flex-wrap: wrap; }
.auth-panel-list { margin: 6px 0 0; padding-left: 18px; font-size: 0.88rem; }

/* ---------- ENQORA MIRROR · Cámara de inteligencia privada ---------- */
/* Composición compacta por defecto (teléfono y módulo angosto); amplia con @container (≥ 1020 px). */
.mirror {
  --space: #05080e;
  --metal: linear-gradient(180deg, #f3dfa8 0%, #c6a66b 52%, #8c6b35 100%);
  container: mirror / inline-size;
  position: relative; border-radius: 24px; overflow: hidden; isolation: isolate; background: var(--space);
  border: 1px solid rgba(217, 224, 234, 0.08);
  box-shadow: 0 50px 120px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.mirror-chamber {
  position: relative; height: clamp(400px, 104vw, 520px);
  background:
    radial-gradient(45% 50% at 50% 42%, rgba(26, 46, 84, 0.45) 0%, rgba(5, 8, 14, 0) 72%),
    var(--space);
}
.mirror-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.mirror-gl { pointer-events: none; }
.mirror-vignette {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(5, 8, 14, 0.85) 100%),
    linear-gradient(116deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 22%);
}

/* Marca */
.mirror-brand { position: absolute; top: 18px; left: 20px; z-index: 2; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
.mirror-wordmark { font-family: var(--font-brand), sans-serif; font-weight: 600; font-size: 1.02rem; letter-spacing: 0.3em; color: var(--ivory); }
.mirror-wordmark em {
  font-style: normal; font-size: 0.66em; letter-spacing: 0.5em; margin-left: 0.5em;
  background: var(--metal); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.mirror-sub { font-size: 0.56rem; letter-spacing: 0.42em; text-transform: uppercase; color: rgba(217, 224, 234, 0.5); }

/* Estado del caso */
.mirror-case { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 14px; padding: 18px 20px; border-top: 1px solid rgba(217, 224, 234, 0.06); }
.mirror-case-mark {
  flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid rgba(198, 166, 107, 0.45);
}
.mirror-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--silver-dim); }
.mirror-phase-trabajando .mirror-dot { background: #e8cb92; animation: mx-beacon 2s ease-out infinite; }
.mirror-phase-revision .mirror-dot { background: #e8cb92; box-shadow: 0 0 0 3px rgba(232, 203, 146, 0.25); }
.mirror-phase-listo .mirror-dot, .mirror-phase-cerrado .mirror-dot { background: #8fd1bf; }
.mirror-case-text { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mirror-case-folio { font-size: 0.7rem; color: rgba(217, 224, 234, 0.55); }
.mirror-case-text strong { font-family: var(--font-brand), sans-serif; font-size: 1.08rem; font-weight: 600; color: var(--ivory); }
.mirror-case-text p { margin: 2px 0 0; font-size: 0.74rem; line-height: 1.45; color: rgba(217, 224, 234, 0.62); }
.mirror-case-link {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 12px;
  border: 1px solid rgba(198, 166, 107, 0.6); color: #f3dfa8; font-size: 0.8rem; text-decoration: none;
  transition: background 0.2s, border-color 0.2s;
}
.mirror-case-link:hover { background: rgba(198, 166, 107, 0.1); border-color: #e8cb92; }

/* Etapa actual y proceso */
.mirror-lead { padding: 6px 20px 4px; }
.mirror-count { font-family: var(--font-brand), sans-serif; font-size: 0.95rem; letter-spacing: 0.08em; color: #e8cb92; }
.mirror-count i { font-style: normal; color: rgba(217, 224, 234, 0.4); }
.mirror-lead h2 { margin: 6px 0 12px; font-size: 1.3rem; line-height: 1.2; color: var(--ivory); }
.mirror-bar { display: grid; grid-template-columns: repeat(9, 1fr); gap: 3px; }
.mirror-bar span { height: 3px; border-radius: 2px; background: rgba(217, 224, 234, 0.12); }
.mirror-bar span.done { background: rgba(143, 209, 191, 0.7); }
.mirror-bar span.current { background: #e8cb92; box-shadow: 0 0 8px rgba(232, 203, 146, 0.6); }
.mirror-stages { display: none; list-style: none; margin: 0; padding: 0; }
.mirror-stages li { position: relative; display: flex; align-items: center; gap: 12px; padding: 5px 0; font-size: 0.8rem; line-height: 1.3; color: rgba(217, 224, 234, 0.48); }
.mirror-stages li:not(:last-child)::before {
  content: ""; position: absolute; left: 8.5px; top: 24px; bottom: -6px; width: 1px; background: rgba(217, 224, 234, 0.12);
}
.mirror-stages li.done::before { background: rgba(143, 209, 191, 0.4); }
.stage-mark {
  flex: 0 0 18px; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid rgba(217, 224, 234, 0.28); background: rgba(5, 8, 14, 0.8);
}
.mirror-stages li.done { color: rgba(217, 224, 234, 0.82); }
.mirror-stages li.done .stage-mark { background: #2f6a5d; border-color: #8fd1bf; color: #eafff8; }
.mirror-stages li.current { color: #f3dfa8; font-weight: 600; }
.mirror-stages li.current .stage-mark { border-color: #e8cb92; box-shadow: 0 0 10px rgba(232, 203, 146, 0.55); }
.mirror-stages li.current .stage-mark::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #e8cb92; }

/* Agentes */
.mirror-agent { display: none; }
.agent-icon {
  flex: 0 0 50px; width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; color: #f3dfa8;
  background: radial-gradient(circle at 35% 30%, rgba(42, 54, 76, 0.96), rgba(8, 12, 20, 0.96));
  border: 1px solid rgba(198, 166, 107, 0.45);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 18px rgba(0, 0, 0, 0.5);
  transition: border-color 0.2s, transform 0.2s;
}
.st-inactivo .agent-icon { color: rgba(217, 224, 234, 0.5); border-color: rgba(217, 224, 234, 0.15); }
.st-completado .agent-icon { color: #8fd1bf; border-color: rgba(143, 209, 191, 0.45); }
.agent-body { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
.agent-body small { font-size: 0.6rem; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(217, 224, 234, 0.5); }
.agent-name { font-family: var(--font-brand), sans-serif; font-size: 0.98rem; font-weight: 600; color: var(--ivory); transition: color 0.2s; }
.st-inactivo .agent-name { color: rgba(217, 224, 234, 0.6); }
.agent-task {
  font-size: 0.72rem; line-height: 1.3; color: rgba(217, 224, 234, 0.62);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.agent-pill {
  margin-top: 6px; padding: 3px 10px; border-radius: 999px; border: 1px solid currentColor;
  font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap;
}
.st-trabajando .agent-pill { color: #e8cb92; }
.st-revision .agent-pill { color: #f3dfa8; background: rgba(198, 166, 107, 0.14); }
.st-completado .agent-pill { color: #8fd1bf; }
.st-inactivo .agent-pill { color: rgba(217, 224, 234, 0.45); }
.mirror-agent:hover .agent-name, .mirror-agent-row:hover .agent-name { color: #f3dfa8; }
.mirror-agent:hover .agent-icon { transform: scale(1.04); }
.is-selected .agent-icon { border-color: var(--silver); }

.mirror-agents { list-style: none; margin: 0; padding: 14px 20px 6px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.mirror-agent-row {
  width: 100%; height: 100%; display: flex; align-items: flex-start; gap: 10px; padding: 10px; text-align: left; cursor: pointer;
  border-radius: 12px; border: 1px solid rgba(217, 224, 234, 0.07); background: rgba(255, 255, 255, 0.015); color: inherit; font: inherit;
}
.mirror-agent-row .agent-icon { flex-basis: 34px; width: 34px; height: 34px; }
.mirror-agent-row .agent-name { font-size: 0.86rem; }
.mirror-agent-row .agent-pill { margin: 2px 0 4px; font-size: 0.54rem; letter-spacing: 0.08em; white-space: normal; }
.mirror-agent-row.is-selected { border-color: rgba(198, 166, 107, 0.5); }

/* Lectura del caso */
.mirror-band { padding: 4px 20px 18px; }
.mirror-band > div { padding: 16px 0; border-top: 1px solid rgba(217, 224, 234, 0.07); }
.band-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 12px; font-size: 0.78rem; color: rgba(217, 224, 234, 0.75); }
.band-back { background: none; border: 0; padding: 0; color: #e8cb92; font: inherit; font-size: 0.74rem; cursor: pointer; }
.band-empty { margin: 0; font-size: 0.8rem; color: rgba(217, 224, 234, 0.55); }
.band-timeline, .band-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.band-timeline li { display: grid; grid-template-columns: 10px 46px minmax(0, 1fr); align-items: baseline; gap: 10px; font-size: 0.8rem; }
.band-timeline time { font-size: 0.74rem; color: rgba(217, 224, 234, 0.55); font-variant-numeric: tabular-nums; }
.tl-text { color: rgba(217, 224, 234, 0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-text b { font-weight: 500; color: var(--ivory); }
.tl-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(217, 224, 234, 0.4); align-self: center; }
.st-trabajando .tl-dot { background: #e8cb92; box-shadow: 0 0 8px rgba(232, 203, 146, 0.7); }
.st-completado .tl-dot { background: #8fd1bf; }
.st-revision .tl-dot { background: transparent; border: 1.5px solid #e8cb92; }
.band-steps li { display: grid; grid-template-columns: 10px minmax(0, 1fr); gap: 10px; }
.band-steps .tl-dot { margin-top: 6px; align-self: start; }
.tl-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tl-title { font-size: 0.84rem; color: var(--ivory); }
.tl-body small { font-size: 0.7rem; color: rgba(217, 224, 234, 0.5); }
.tl-detail { color: rgba(217, 224, 234, 0.7) !important; }
.tl-progress { display: block; height: 2px; margin: 4px 0 2px; background: rgba(217, 224, 234, 0.1); }
.tl-progress > span { display: block; height: 100%; width: var(--p, 0%); background: linear-gradient(90deg, #8c6b35, #f3dfa8); }

.band-message { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; }
.band-message p { margin: 0; font-family: var(--font-brand), sans-serif; font-size: 1.05rem; line-height: 1.45; color: var(--ivory); }
.band-message .band-auth {
  display: inline-flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid rgba(217, 224, 234, 0.08);
  font-family: var(--font-body), sans-serif; font-size: 0.78rem; color: #e8cb92;
}
.band-wave { display: inline-flex; align-items: center; gap: 3px; height: 18px; }
.band-wave i { display: block; width: 2px; height: 6px; border-radius: 1px; background: rgba(198, 166, 107, 0.6); }
.band-wave i:nth-child(2), .band-wave i:nth-child(4) { height: 11px; }
.band-wave i:nth-child(3) { height: 16px; }
.band-wave.is-live i { animation: mx-wave 1.6s ease-in-out infinite; }
.band-wave.is-live i:nth-child(2) { animation-delay: 0.15s; }
.band-wave.is-live i:nth-child(3) { animation-delay: 0.3s; }
.band-wave.is-live i:nth-child(4) { animation-delay: 0.45s; }
.band-wave.is-live i:nth-child(5) { animation-delay: 0.6s; }

.docs-total { font-family: var(--font-brand), sans-serif; font-size: 1.35rem; color: var(--ivory); }
.docs-total small { font-family: var(--font-body), sans-serif; font-size: 0.7rem; color: rgba(217, 224, 234, 0.5); }
.docs-bar { display: flex; gap: 2px; height: 3px; margin-bottom: 14px; border-radius: 2px; overflow: hidden; }
.docs-seg { display: block; flex-basis: 0; }
.docs-seg.docs-pdf { background: #e8cb92; }
.docs-seg.docs-xml { background: #6ea5ff; }
.docs-seg.docs-sheet { background: #8fd1bf; }
.docs-seg.docs-other { background: rgba(217, 224, 234, 0.45); }
.docs-kinds { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.docs-kinds li { display: flex; flex-direction: column; align-items: center; gap: 3px; color: rgba(217, 224, 234, 0.6); }
.docs-kinds span { font-size: 0.66rem; text-align: center; }
.docs-kinds b { font-family: var(--font-brand), sans-serif; font-size: 0.98rem; font-weight: 600; color: var(--ivory); }
.mirror-legal { margin: 0; padding-top: 10px; font-size: 0.64rem; line-height: 1.4; color: rgba(154, 166, 184, 0.6); }
.mirror-link { margin: 0; text-align: right; font-size: 0.86rem; }

.fill-p0 { --p: 0%; }
.fill-p1 { --p: 10%; }
.fill-p2 { --p: 20%; }
.fill-p3 { --p: 30%; }
.fill-p4 { --p: 40%; }
.fill-p5 { --p: 50%; }
.fill-p6 { --p: 60%; }
.fill-p7 { --p: 70%; }
.fill-p8 { --p: 80%; }
.fill-p9 { --p: 90%; }
.fill-p10 { --p: 100%; }

@keyframes mx-beacon { 0% { box-shadow: 0 0 0 0 rgba(232, 203, 146, 0.55); } 100% { box-shadow: 0 0 0 10px rgba(232, 203, 146, 0); } }
@keyframes mx-wave { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(1.2); } }

/* Composición amplia: cámara cinematográfica con capas de información alrededor del núcleo */
@container mirror (min-width: 1020px) {
  .mirror-chamber { height: clamp(780px, 90vh, 920px); }
  .mirror-immersive .mirror-chamber { height: clamp(820px, 92vh, 980px); }
  .mirror-brand { top: 30px; left: 34px; gap: 8px; }
  .mirror-wordmark { font-size: 1.55rem; }
  .mirror-sub { font-size: 0.6rem; }

  .mirror-case {
    position: absolute; top: 24px; right: 26px; width: 460px; z-index: 3; flex-wrap: nowrap;
    padding: 16px 18px; border-radius: 16px; border: 1px solid rgba(198, 166, 107, 0.22);
    background: rgba(8, 13, 22, 0.55); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  }

  .mirror-lead { position: absolute; left: 34px; top: 128px; width: 244px; padding: 0; z-index: 2; }
  .mirror-count { font-size: 1.1rem; }
  .mirror-lead h2 { font-size: 1.6rem; margin: 6px 0 18px; }
  .mirror-bar { display: none; }
  .mirror-stages { display: block; }

  .mirror-agent {
    position: absolute; z-index: 3; display: flex; align-items: flex-start; gap: 12px; padding: 0;
    background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .mirror-agent.side-left { flex-direction: row-reverse; text-align: right; }
  .mirror-agent.side-left .agent-body { align-items: flex-end; }
  .mirror-agents { display: none; }

  .mirror-band {
    position: absolute; left: 22px; right: 22px; bottom: 20px; z-index: 2; padding: 0;
    display: grid; grid-template-columns: 1.15fr 1fr 1fr; grid-template-rows: 1fr auto; height: 214px;
    border-radius: 18px; border: 1px solid rgba(217, 224, 234, 0.08);
    background: rgba(6, 10, 18, 0.62); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  }
  .mirror-band > div { padding: 18px 24px 10px; border-top: 0; }
  .mirror-band > div + div { border-left: 1px solid rgba(217, 224, 234, 0.07); }
  .mirror-legal { grid-column: 1 / -1; padding: 0 24px 12px; }
}

.input-num { width: 74px !important; flex: 0 0 74px !important; }
