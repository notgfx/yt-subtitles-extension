"use strict";

(() => {
  if (window.__ytsPanelLoaded) return;
  window.__ytsPanelLoaded = true;

  /* ================= Константы ================= */

	const AI_SYSTEM =
	  "Ты помощник, который анализирует транскрипт видео с YouTube. " +
	  "Транскрипт мог быть получен автоматическим распознаванием речи, поэтому в именах, терминах и числах возможны ошибки. " +
	  "Опирайся только на транскрипт и не выдумывай факты; если чего-то в нём нет, так и скажи. " +
	  "Отвечай на русском языке, если пользователь не просит иное. " +
	  "Пиши естественным, живым и грамотным языком, как автор хорошего редакционного материала. " +
	  "Избегай канцелярита, шаблонных формулировок, избыточной нумерации и искусственного дробления текста. " +
	  "Не повторяй формулировки задания в качестве заголовков. " +
	  "Не используй таблицы, если пользователь явно их не запросил. " +
	  "Не добавляй служебные пояснения в заголовки, например количество предложений или тезисов. " +
	  "Используй короткие содержательные заголовки только там, где они действительно помогают восприятию. " +
	  "Таймкоды указывай в формате [мм:сс].";

	const PROMPTS = [
	  {
		id: "summary",
		label: "Краткое содержание",
		text:
		  "Подготовь содержательное и лаконичное саммари видео. " +
		  "Начни с небольшого вводного абзаца, который передаёт основную тему и суть видео. " +
		  "Затем выдели 5–8 наиболее важных мыслей в виде обычного маркированного списка. " +
		  "Не используй таблицы, нумерацию и формальные заголовки вроде «Ключевые тезисы». " +
		  "При наличии таймкодов добавляй их в конце соответствующих пунктов. " +
		  "Заверши текст общим выводом, органично вписав его в отдельный заключительный абзац. " +
		  "Не добавляй заголовки вроде «Краткое содержание (2–3 предложения)» или «Главный вывод»."
	  },
	  {
		id: "timeline",
		label: "Структура по таймкодам",
		text:
		  "Последовательно опиши ход видео, выделив основные темы и смысловые переходы. " +
		  "Используй маркированный список: таймкод, короткое название темы и её краткое содержание. " +
		  "Не дроби видео на слишком мелкие фрагменты. " +
		  "Сохраняй хронологический порядок и не пропускай важные части."
	  },
	  {
		id: "notes",
		label: "Подробный конспект",
		text:
		  "Подготовь подробный и хорошо структурированный конспект видео. " +
		  "Раздели материал на смысловые разделы с короткими содержательными заголовками. " +
		  "Раскрой основные мысли, аргументы, определения, примеры и взаимосвязи между ними. " +
		  "Сохраняй последовательность и логику изложения. " +
		  "Избегай повторов и не превращай конспект в дословную расшифровку. " +
		  "Добавляй таймкоды к соответствующим разделам, если они доступны."
	  },
	  {
		id: "claims",
		label: "Утверждения для проверки",
		text:
		  "Выдели фактические утверждения из видео, которые имеет смысл проверить по независимым источникам. " +
		  "Особое внимание удели научным, медицинским, историческим, статистическим и техническим заявлениям. " +
		  "Для каждого утверждения укажи его суть, контекст и таймкод. " +
		  "Кратко поясни, что именно требует проверки. " +
		  "Не оценивай достоверность утверждений без независимых источников. " +
		  "Оформи результат обычным маркированным списком, без таблиц."
	  },
	  {
		id: "qa",
		label: "Вопросы и ответы",
		text:
		  "Составь 10 содержательных вопросов по материалу видео и ответь на каждый из них. " +
		  "Вопросы должны охватывать основные темы, важные детали и причинно-следственные связи. " +
		  "Ответы должны быть краткими, понятными и основанными исключительно на транскрипте. " +
		  "Используй формат вопроса и ответа, без дополнительных вступлений и заключений."
	  },
	  {
		id: "custom",
		label: "Свой промпт",
		text: ""
	  },
	];

  const svg = (paths) =>
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const ICON = {
    cc: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.5 10.2a2 2 0 1 0 0 3.6M17 10.2a2 2 0 1 0 0 3.6"/>'),
    bug: svg('<path d="M9 8a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM12 11v8M5 12h4M15 12h4M6 7l3 2M18 7l-3 2M6 19l3-2M18 19l-3-2"/>'),
    sliders: svg('<path d="M3 6h9M16 6h5M3 12h3M10 12h11M3 18h11M18 18h3"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>'),
    chevron: svg('<path d="m6 9 6 6 6-6"/>'),
    chevronRight: svg('<path d="m9 6 6 6-6 6"/>'),
    download: svg('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>'),
    text: svg('<path d="M5 6h14M5 11h14M5 16h9"/>'),
    pencil: svg('<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/>'),
    sparkle: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16v4M17 18h4"/>'),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.3 7.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.9"/>'),
    check: svg('<path d="m5 12.5 5 5L20 7"/>'),
    cross: svg('<path d="M7 7l10 10M17 7 7 17"/>'),
    refresh: svg('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2"/>'),
    trash: svg('<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6"/>'),
  };

  /* ---- Стили: собственная палитра, не зависящая от переменных YouTube и Dark Reader ---- */
  const CSS = `
    :host{
      all:initial;display:block;margin:0 0 12px!important;
	  padding:0;
      background:none!important;border:0!important;
      color-scheme:light;
      --text:#0f0f0f;--muted:#606060;--surface:#f7f7f7;--field:#ffffff;--border:rgba(0,0,0,.14);
      --accent:#065fd4;--pri-bg:#0f0f0f;--pri-fg:#ffffff;--danger:#c5221f;--ok:#137333;
      --sel-bg:#b9d6fb;--sel-fg:#0f0f0f;
    }
    :host([data-theme="dark"]){
      color-scheme:dark;
      --text:#f1f1f1;--muted:#a8a8a8;--surface:#1e1e1e;--field:#2c2c2c;--border:rgba(255,255,255,.14);
      --accent:#3ea6ff;--pri-bg:#f1f1f1;--pri-fg:#0f0f0f;--danger:#ff8a80;--ok:#6fdc97;
      --sel-bg:#24518f;--sel-fg:#ffffff;
    }
    *,*::before,*::after{box-sizing:border-box}
    [hidden]{display:none!important}
    ::selection{background:var(--sel-bg);color:var(--sel-fg)}
    .wrap{container-type:inline-size}
    .card{font:12px/1.4 Roboto,"Segoe UI",Arial,sans-serif;color:var(--text);background:var(--surface);
      border:1px solid var(--border);border-radius:12px;overflow:hidden}
    button,select,input,textarea{font:inherit;color:inherit}
	
    /* Выбор модели */
    .model-row{display:flex;align-items:center;gap:4px;min-width:0}
    .model-row select{flex:1;min-width:0}
    .model-row .ibtn{width:28px;height:28px}
    .model-desc{font-size:10.5px;line-height:1.35;color:var(--muted);margin-top:3px}
    .model-manual{align-self:flex-start;margin-top:2px;font-size:10.5px}
    .model-row .ibtn.loading svg{animation:modelSpin .8s linear infinite}
    @keyframes modelSpin{to{transform:rotate(360deg)}}

    /* Шапка с вкладками */
    .head{display:flex;align-items:center;gap:2px;padding:0 6px 0 12px;min-height:38px}
    .logo{display:grid;place-items:center;color:var(--muted);margin-right:8px}
    .tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);
      font-weight:600;font-size:12px;padding:12px 8px 9px;cursor:pointer}
    .tab:hover{color:var(--text)}
    .tab[aria-selected="true"]{color:var(--text);border-bottom-color:var(--text)}
    .subtabs{display:flex;align-items:center;gap:2px;margin:0 0 10px;border-bottom:1px solid var(--border)}
    .subtab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);
      font-weight:500;font-size:11px;padding:4px 8px 5px;cursor:pointer}
    .subtab:hover{color:var(--text)}
    .subtab[aria-selected="true"]{color:var(--text);border-bottom-color:var(--text)}
    .sp{flex:1}
    .ibtn{width:28px;height:28px;display:inline-grid;place-items:center;padding:0;border:0;border-radius:8px;
      background:none;color:var(--muted);cursor:pointer;flex:0 0 auto}
    .ibtn:hover:not(:disabled){background:color-mix(in srgb,var(--text) 10%,transparent);color:var(--text)}
    .ibtn[aria-pressed="true"]{background:color-mix(in srgb,var(--text) 14%,transparent);color:var(--text)}
    .ibtn:disabled{opacity:.35;cursor:default}
    :focus-visible{outline:2px solid var(--accent);outline-offset:1px}

    .body{padding:8px 12px 12px;border-top:1px solid var(--border)}

    /* Сетка и поля */
    .grid{display:grid;gap:8px}
    .g3{grid-template-columns:repeat(3,minmax(0,1fr))}
    .g2{grid-template-columns:repeat(2,minmax(0,1fr))}
    .span2{grid-column:span 2}
    @container (max-width:340px){ .g3{grid-template-columns:repeat(2,minmax(0,1fr))} }
    .field{display:flex;flex-direction:column;gap:3px;min-width:0}
    .field>label{font-size:10.5px;font-weight:500;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    select,input:not([type="checkbox"]),textarea{width:100%;min-width:0;height:28px;padding:0 8px;border-radius:8px;
      border:1px solid var(--border);background:var(--field);color:var(--text)}
    select:disabled{opacity:.55}
    textarea{height:auto;padding:6px 8px;resize:vertical;line-height:1.45;margin-top:8px}
    input::placeholder,textarea::placeholder{color:var(--muted);opacity:.8}
    .inwrap{position:relative}
    .inwrap input{padding-right:30px}
    .inwrap .ibtn{position:absolute;right:0;top:0}

    /* Кнопки */
    .actions{display:flex;gap:6px;align-items:center;margin-top:8px}
    .btn{height:28px;padding:0 14px;border-radius:14px;border:1px solid var(--border);background:var(--field);
      color:var(--text);font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
    .btn:hover:not(:disabled){background:color-mix(in srgb,var(--field) 88%,var(--text))}
    .btn.pri{flex:1;background:var(--pri-bg);color:var(--pri-fg);border-color:transparent}
    .btn.pri:hover:not(:disabled){background:var(--pri-bg);opacity:.88}
    .btn:disabled{opacity:.5;cursor:default}
    .chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--border);
      border-radius:14px;background:var(--field);cursor:pointer;white-space:nowrap;user-select:none}
    .chip input{width:auto;height:auto;margin:0;accent-color:var(--accent)}
    .row2{display:flex;gap:6px;align-items:flex-end}
    .row2 .grow{flex:1;min-width:0}

    /* Статусы */
    .msg{font-size:11.5px;color:var(--muted);margin-bottom:8px}
    .msg:empty{display:none}
    .prog{height:2px;margin:0 0 8px;border-radius:99px;overflow:hidden;
      background:color-mix(in srgb,var(--text) 14%,transparent)}
    .prog>span{display:block;height:100%;width:0;background:var(--accent);transition:width .18s ease}
    .stat{margin-top:6px;font-size:11px;color:var(--muted)}
    .stat:empty{display:none}
    .meta{display:flex;flex-wrap:wrap;gap:2px 10px;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--muted)}
    .meta:has(#lnkProv:empty):has(#aiStat:empty){display:none}
    .error{color:var(--danger)}
    .ok{color:var(--ok)}
    .hint{margin-top:6px;font-size:11px;color:var(--muted)}
    .hint:empty{display:none}
    .actions.wrap{flex-wrap:wrap}
    .px-list{display:flex;flex-direction:column;gap:4px;margin:6px 0 8px}
    .px-row{display:flex;align-items:center;gap:2px}
    .px-item{position:relative;display:block;flex:1;min-width:0;text-align:left;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--field);cursor:pointer;overflow:hidden}
    .px-item:disabled{cursor:default;color:var(--text)}
    .px-row.active .px-item{border-color:var(--accent)}
    .px-list.busy .px-row:not(.testing) .px-item{opacity:.5}
    .px-row.testing .px-item{opacity:1;border-color:var(--accent);padding-bottom:11px}
    .px-prog{position:absolute;left:8px;right:8px;bottom:4px;height:2px;border-radius:99px;overflow:hidden;
      background:color-mix(in srgb,var(--text) 14%,transparent)}
    .px-prog>span{display:block;height:100%;width:38%;border-radius:99px;background:var(--accent);
      animation:pxLoad 1.05s ease-in-out infinite}
    @keyframes pxLoad{from{transform:translateX(-130%)}to{transform:translateX(310%)}}
    @media (prefers-reduced-motion:reduce){
      .px-prog>span{width:100%;animation:none}
    }
    .px-item .name{display:block;font-weight:600;word-break:break-word}
    .px-mark{display:inline-grid;place-items:center;width:15px;height:15px;margin:0 5px 0 0;vertical-align:-3px;border-radius:50%}
    .px-mark svg{width:11px;height:11px;stroke-width:2.4}
    .px-mark.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 16%,transparent)}
    .px-mark.bad{color:var(--danger);background:color-mix(in srgb,var(--danger) 16%,transparent)}
    .px-item .sub{display:block;margin-top:2px;color:var(--muted);font-size:10.5px;word-break:break-word}
    .file{display:none}
    .link{appearance:none;background:none;border:0;padding:0;color:var(--muted);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
    .link:hover{color:var(--text)}
    .link:disabled{opacity:.45;cursor:default;text-decoration:none}
    .provline{display:inline-flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline;min-width:0}
    .ai-cache{display:flex;flex-direction:column;gap:4px;margin-top:6px;max-height:168px;overflow:auto}
    .ai-cache-item{display:block;width:100%;text-align:left;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--field);color:var(--text);cursor:pointer;font:inherit;font-size:11.5px;line-height:1.35}
    .ai-cache-item:hover{border-color:var(--accent)}

    /* Блоки с текстом */
    .box{margin-top:8px;padding:8px 10px;max-height:170px;overflow:auto;border-radius:8px;border:1px solid var(--border);
      background:var(--field);color:var(--text);scrollbar-width:thin;
      scrollbar-color:color-mix(in srgb,var(--text) 35%,transparent) transparent}
    .mono{font:11.5px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
    .outwrap{position:relative}
    .outwrap .copy{position:absolute;top:12px;right:6px;background:var(--field);border:1px solid var(--border)}
    .md{max-height:260px;padding-right:34px;font-size:12.5px;line-height:1.55;user-select:text}
    .md>*:first-child{margin-top:0}
    .md>*:last-child{margin-bottom:0}
    .md h4{margin:10px 0 4px;font-size:12.5px}
    .md p{margin:0 0 6px;white-space:pre-wrap}
    .md ul,.md ol{margin:0 0 6px;padding-left:18px}
    .md li{margin:1px 0}
    .md code{font:11.5px ui-monospace,Menlo,Consolas,monospace;padding:1px 4px;border-radius:4px;
      background:color-mix(in srgb,var(--text) 12%,transparent)}
    .ts{color:var(--accent);cursor:pointer;font-variant-numeric:tabular-nums;border-radius:3px}
    .ts:hover{text-decoration:underline}

    @media (prefers-reduced-motion:no-preference){
      .btn,.ibtn,.tab,.subtab{transition:background-color .12s,color .12s,opacity .12s}
    }
  `;

  const field = (label, control, id, cls = "") =>
    `<div class="field ${cls}"><label for="${id}">${label}</label>${control}</div>`;

  const HTML = `
    <div class="wrap"><div class="card">
      <div class="head" role="tablist" aria-label="Разделы">
        <span class="logo">${ICON.cc}</span>
        <button class="tab" id="tabSubs" role="tab" aria-controls="paneSubs">Субтитры</button>
        <button class="tab" id="tabAI" role="tab" aria-controls="paneAI">ИИ-анализ</button>
        <span class="sp"></span>
        <button class="ibtn" id="btnDebug" title="Отладка" aria-label="Отладка">${ICON.bug}</button>
        <button class="ibtn" id="btnGear" title="Настройки ИИ-API" aria-label="Настройки ИИ-API" aria-pressed="false">${ICON.sliders}</button>
        <button class="ibtn" id="btnCollapse" title="Свернуть" aria-label="Свернуть" aria-expanded="true">${ICON.chevron}</button>
      </div>

      <div class="body" id="body">
        <div class="prog" id="prog" hidden><span></span></div>
        <div class="msg" id="msg" role="status" aria-live="polite"></div>

        <div id="paneSubs" role="tabpanel" aria-labelledby="tabSubs">
          <div class="grid g3">
            ${field("Язык", '<select id="selTrack"></select>', "selTrack")}
            ${field("Перевод", '<select id="selTr"></select>', "selTr")}
            ${field("Формат", '<select id="selFmt"><option value="srt">SRT</option><option value="vtt">VTT</option><option value="txt">TXT</option></select>', "selFmt")}
          </div>
          <div class="actions">
            <button class="btn pri" id="btnLoad">Получить субтитры</button>
            <button class="ibtn" id="btnDl" title="Скачать файл" aria-label="Скачать файл" disabled>${ICON.download}</button>
            <button class="ibtn" id="btnCopy" title="Копировать текст" aria-label="Копировать текст" disabled>${ICON.copy}</button>
            <button class="ibtn" id="btnText" title="Показать текст" aria-label="Показать текст" aria-pressed="false" disabled>${ICON.text}</button>
          </div>
          <div class="stat" id="stat"></div>
          <div class="box mono" id="preview" hidden></div>
        </div>

        <div id="paneAI" role="tabpanel" aria-labelledby="tabAI" hidden>
          <div class="row2">
            ${field("Задача", '<select id="selPrompt"></select>', "selPrompt", "grow")}
            <label class="chip" title="Передавать таймкоды в ИИ"><input type="checkbox" id="chkTs"><span>Таймкоды</span></label>
            <button class="ibtn" id="btnPromptEdit" title="Править текст задачи" aria-label="Править текст задачи" aria-pressed="false">${ICON.pencil}</button>
          </div>
          <textarea id="txtPrompt" rows="3" hidden aria-label="Текст задачи"></textarea>
          <div class="actions">
            <button class="btn pri" id="btnAnalyze">${ICON.sparkle}<span>Анализировать</span></button>
          </div>
          <div class="meta"><span class="provline"><button class="link" id="lnkProv" title="Открыть настройки API"></button><button class="link" id="lnkAiCache" type="button" hidden title="Показать сохранённые ответы для этого видео">Прошлые ответы</button></span><span id="aiStat" role="status" aria-live="polite"></span></div>
          <div class="ai-cache" id="aiCacheList" hidden></div>
          <div class="outwrap" id="outWrap" hidden>
            <div class="box md" id="aiOut" tabindex="0"></div>
            <button class="ibtn copy" id="btnCopyAI" title="Копировать ответ" aria-label="Копировать ответ">${ICON.copy}</button>
          </div>
        </div>

        <div id="paneSet" role="tabpanel" aria-label="Настройки ИИ-API" hidden>
          <div class="subtabs" role="tablist" aria-label="Настройки">
            <button class="subtab" id="tabSetProv" role="tab" aria-controls="paneSetProv" aria-selected="true">Провайдер</button>
            <button class="subtab" id="tabSetProxy" role="tab" aria-controls="paneSetProxy" aria-selected="false">Прокси</button>
            <button class="subtab" id="tabSetIo" role="tab" aria-controls="paneSetIo" aria-selected="false">Экспорт</button>
          </div>

          <div id="paneSetProv" role="tabpanel" aria-labelledby="tabSetProv">
            <div class="grid g2">
              ${field("Провайдер", '<select id="aiPreset"></select>', "aiPreset")}
              ${field("Тип API", '<select id="aiStyle"><option value="openai">OpenAI-совместимый</option><option value="anthropic">Anthropic</option></select>', "aiStyle")}
              ${field("URL эндпоинта", '<input id="aiUrl" type="text" spellcheck="false" placeholder="https://…">', "aiUrl", "span2")}
              ${field("API-токен", `<div class="inwrap"><input id="aiToken" type="password" autocomplete="off" spellcheck="false" placeholder="токен"><button class="ibtn" id="btnEye" title="Показать / скрыть" aria-label="Показать или скрыть токен">${ICON.eye}</button></div>`, "aiToken")}
              ${field("Модель", `
  <div class="model-row">
    <select id="aiModel"></select>
    <button class="ibtn" id="btnRefreshModels"
      type="button" title="Обновить список моделей"
      aria-label="Обновить список моделей">
      ${ICON.refresh}
    </button>
  </div>
  <div class="model-desc" id="aiModelDesc"></div>
  <button class="link model-manual" id="btnModelManual"
    type="button">Ввести ID вручную</button>
  <input id="aiModelCustom" type="text"
    spellcheck="false" placeholder="ID модели" hidden>
`, "aiModel")}
              ${field("Макс. токенов ответа", '<input id="aiMaxTokens" type="number" min="1" placeholder="авто">', "aiMaxTokens")}
              ${field("Лимит транскрипта, симв.", '<input id="aiMaxChars" type="number" min="1000">', "aiMaxChars")}
              ${field("Лимит токенов запроса (0 — авто)", '<input id="aiMaxInTok" type="number" min="0" placeholder="авто">', "aiMaxInTok")}
            </div>
            <div class="hint" id="aiHint"></div>
            <div class="actions">
              <button class="btn pri" id="btnSaveAI">Сохранить</button>
              <button class="btn" id="btnTestAI">Проверить</button>
            </div>
            <div class="stat" id="aiSetMsg" role="status" aria-live="polite"></div>
          </div>

          <div id="paneSetProxy" role="tabpanel" aria-labelledby="tabSetProxy" hidden>
            <label class="chip"><input type="checkbox" id="proxyEnabled"><span>Использовать прокси</span></label>
            <div class="hint" id="proxyStatus"></div>
            <div class="px-list" id="proxyList"></div>
            <div class="grid g2">
              ${field("Название", '<input id="proxyName" type="text" maxlength="80" placeholder="необязательно">', "proxyName")}
              ${field("Тип", '<select id="proxyScheme"><option value="http">HTTP</option><option value="https">HTTPS</option><option value="socks4">SOCKS4</option><option value="socks5">SOCKS5</option></select>', "proxyScheme")}
              ${field("Адрес", '<input id="proxyHost" type="text" spellcheck="false" placeholder="IP или домен">', "proxyHost")}
              ${field("Порт", '<input id="proxyPort" type="number" min="1" max="65535" placeholder="8080">', "proxyPort")}
              ${field("Логин", '<input id="proxyUser" type="text" autocomplete="off" spellcheck="false" placeholder="необязательно">', "proxyUser")}
              ${field("Пароль", `<div class="inwrap"><input id="proxyPass" type="password" autocomplete="off" spellcheck="false" placeholder="необязательно"><button class="ibtn" id="btnProxyEye" type="button" title="Показать / скрыть" aria-label="Показать или скрыть пароль">${ICON.eye}</button></div>`, "proxyPass")}
            </div>
            <div class="hint" id="proxySocksHint"></div>
            <div class="actions wrap">
              <button class="btn" id="btnProxyNew" type="button">Новый</button>
              <button class="btn pri" id="btnProxySave" type="button">Сохранить прокси</button>
            </div>
            <div class="actions wrap">
              <button class="btn" id="btnProxyCheck" type="button">Проверить</button>
              <button class="btn" id="btnProxyCheckAll" type="button">Проверить все</button>
              <button class="btn" id="btnProxyStop" type="button">Остановить проверку</button>
            </div>
            <div class="stat" id="proxyMsg" role="status" aria-live="polite"></div>
            <div class="hint">Через прокси идут только запросы к адресу LLM API. IP проверяем через api.ipify.org</div>
          </div>

          <div id="paneSetIo" role="tabpanel" aria-labelledby="tabSetIo" hidden>
            <div class="actions wrap">
              <button class="btn" id="btnExport" type="button">Экспорт настроек</button>
              <button class="btn" id="btnImport" type="button">Импорт настроек</button>
            </div>
            <input id="importFile" class="file" type="file" accept="application/json,.json">
            <div class="stat" id="ioMsg" role="status" aria-live="polite"></div>
          </div>
        </div>
      </div>
    </div></div>
  `;

  /* ================= Состояние ================= */

  const state = {
    videoId: "", title: "", tracks: [], translations: [],
    cues: null, meta: null, aiRaw: "", previewReady: false,
    busy: false, loadSeq: 0,
    ui: { collapsed: false, pane: "subs", last: "subs", setTab: "provider", format: "srt", promptId: "summary", customPrompt: "", withTs: true, lang: "" },
    ai: { active: "anthropic", profiles: {}, maxTokens: "", maxChars: 200000, maxInputTokens: 0 },
	modelCache: {},
    proxy: { enabled: false, activeId: null, items: [] },
    proxyCheck: null,
    proxyEditing: null,
    proxyBusy: false,
    proxyChecking: false,
    proxyCheckKind: "",
    proxyCheckId: "",
    aiCacheRows: [],
    proxyRuntime: null,
  };

  let host = null;
  let root = null;
  let storeReady = false;
  let timer = null;

  const q = (id) => root.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          const err = chrome.runtime.lastError;
          resolve(err ? { ok: false, error: err.message } : r || { ok: false, error: "нет ответа" });
        });
      } catch (_) {
        resolve({ ok: false, error: "Расширение было обновлено — перезагрузите страницу (F5)" });
      }
    });
  }

  /* ================= Хранилище ================= */

  async function loadStore() {
    try {
      const r = await chrome.storage.local.get(["ui", "ai", "__aiModelsCache", "proxy"]);
      Object.assign(state.ui, r.ui || {});
      Object.assign(state.ai, r.ai || {});
      state.ai.profiles = state.ai.profiles || {};
	  state.modelCache = r.__aiModelsCache || {};
      state.proxy = (typeof YTSProxy !== "undefined" ? YTSProxy.normalizeProxyState(r.proxy) : state.proxy);
      state.proxyCheck = r.proxy && r.proxy.check || null;
    } catch (_) { /* ignore */ }
    storeReady = true;
  }
  const saveUi = () => { try { chrome.storage.local.set({ ui: state.ui }); } catch (_) {} };
  const profileFor = (id) => Object.assign(aiPresetDefaults(id), state.ai.profiles[id] || {});
    /* ================= Кэш результатов ИИ ================= */

  const AI_CACHE_KEY = "aiSummaryCache";
  const AI_CACHE_LIMIT = 20;
  const AI_CACHE_MAX_RESULT = 150000;

  // Определяем, для каких именно настроек был получен результат
	function getAIResultIdentity() {
	  const track = currentTrack();
	  if (!track || !state.videoId) return null;

	  const id = state.ai.active;
	  const prof = profileFor(id);

	  let endpoint = prof.url || "";
	  try {
		const u = new URL(endpoint);
		endpoint = u.origin + u.pathname;
	  } catch (_) {}

	  return {
		videoId: state.videoId,
		language: track.languageCode,
		trackKind: track.kind || "",
		translation: currentTlang(),
		promptId: q("selPrompt").value,
		prompt: q("txtPrompt").value.trim(),
		withTs: !!q("chkTs").checked,
		provider: id,
		style: prof.style,
		endpoint,
		model: prof.model,
		maxTokens: Number(state.ai.maxTokens) || 0,
		maxChars: Number(state.ai.maxChars) || 200000,
		version: 2,
	  };
	}

  let aiCacheSeq = 0;

  async function saveAIResult(identity, text) {
    if (!identity || !text || text.length > AI_CACHE_MAX_RESULT) return;

    try {
      const key = JSON.stringify(identity);
      const data = await chrome.storage.local.get(AI_CACHE_KEY);
      const records = Array.isArray(data[AI_CACHE_KEY])
        ? data[AI_CACHE_KEY]
        : [];

      const next = records.filter((r) => r.key !== key);

      next.unshift({
        key,
        identity,
        text,
        savedAt: Date.now(),
      });

      await chrome.storage.local.set({
        [AI_CACHE_KEY]: next.slice(0, AI_CACHE_LIMIT),
      });
      refreshAiCacheLink();
    } catch (e) {
      console.warn("[YTS] Не удалось сохранить саммари:", e);
    }
  }

  function squashText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function requestTitle(identity) {
    const preset = PROMPTS.find((p) => p.id === identity.promptId);
    const prompt = squashText(identity.prompt);
    if (!preset || identity.promptId === "custom") return prompt.slice(0, 90) || "Свой промпт";
    if (prompt && prompt !== squashText(preset.text)) {
      return preset.label + " · " + prompt.slice(0, 70);
    }
    return preset.label;
  }

  function cacheItemLabel(record) {
    const identity = record.identity || {};
    const parts = [requestTitle(identity)];
    if (identity.language) {
      parts.push(identity.translation ? identity.language + " → " + identity.translation : identity.language);
    }
    if (identity.model) parts.push(identity.model);
    if (record.savedAt) {
      const date = new Date(record.savedAt);
      if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleString("ru-RU"));
    }
    return parts.join(" · ");
  }

  function showCachedRecord(record) {
    if (!record || !record.text) return;
    state.aiRaw = record.text;
    renderMarkdown(q("aiOut"), record.text);
    q("outWrap").hidden = false;
    q("aiCacheList").hidden = true;
    setStat("aiStat", "Из кэша · " + cacheItemLabel(record));
  }

  function renderAiCacheList(rows) {
    const box = q("aiCacheList");
    box.replaceChildren();
    rows.forEach((record) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-cache-item";
      button.textContent = cacheItemLabel(record);
      button.onclick = () => showCachedRecord(record);
      box.appendChild(button);
    });
  }

  function openAiCache() {
    const rows = state.aiCacheRows || [];
    if (!rows.length) return;
    if (rows.length === 1) {
      showCachedRecord(rows[0]);
      return;
    }
    const box = q("aiCacheList");
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    renderAiCacheList(rows);
    box.hidden = false;
  }

  async function refreshAiCacheLink() {
    const vid = state.videoId;
    const btn = root && q("lnkAiCache");
    const box = root && q("aiCacheList");
    if (!btn || !box) return;
    if (!vid) {
      state.aiCacheRows = [];
      btn.hidden = true;
      box.hidden = true;
      return;
    }
    let rows = [];
    try {
      const data = await chrome.storage.local.get(AI_CACHE_KEY);
      const records = Array.isArray(data[AI_CACHE_KEY]) ? data[AI_CACHE_KEY] : [];
      rows = records.filter((record) => record && record.text && record.identity && record.identity.videoId === vid);
    } catch (_) {}
    if (!root || vid !== state.videoId) return;
    state.aiCacheRows = rows;
    btn.hidden = !rows.length;
    btn.textContent = rows.length > 1 ? "Прошлые ответы · " + rows.length : "Прошлые ответы";
    if (!rows.length) box.hidden = true;
    else if (!box.hidden) renderAiCacheList(rows);
  }

  async function restoreAIResult() {
    const seq = ++aiCacheSeq;
    const identity = getAIResultIdentity();

    state.aiRaw = "";
    q("outWrap").hidden = true;
    q("aiOut").textContent = "";
    setStat("aiStat", "");

    if (!identity) return;

    try {
      const key = JSON.stringify(identity);
      const data = await chrome.storage.local.get(AI_CACHE_KEY);

      // За время чтения пользователь мог переключить видео или настройки
      if (seq !== aiCacheSeq) return;

      const currentIdentity = getAIResultIdentity();
      if (JSON.stringify(currentIdentity) !== key) return;

      const records = Array.isArray(data[AI_CACHE_KEY])
        ? data[AI_CACHE_KEY]
        : [];

      const cached = records.find((r) => r.key === key);

      if (!cached || !cached.text) return;

      state.aiRaw = cached.text;
      renderMarkdown(q("aiOut"), cached.text);
      q("outWrap").hidden = false;

      const date = new Date(cached.savedAt).toLocaleString("ru-RU");

      setStat(
        "aiStat",
        `Из кэша · сохранено ${date}`,
        "ok"
      );
    } catch (e) {
      console.warn("[YTS] Не удалось восстановить саммари:", e);
    }
    refreshAiCacheLink();
  }

  /* ================= Тема =================
   * Определяем реальный вид страницы по фону (учитывает тёмную тему YouTube и Dark Reader),
   * а не полагаемся на переменные YouTube, которые сторонние расширения могут переписать. */

  function detectTheme() {
    const de = document.documentElement;
    if (de.hasAttribute("dark")) return "dark";
    const candidates = [document.querySelector("ytd-app"), document.body, de];
    for (const el of candidates) {
      if (!el) continue;
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const [r, g, b, a = 1] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (a === 0) continue;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5 ? "dark" : "light";
    }
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme() {
    if (!host) return;
    const t = detectTheme();
    if (host.getAttribute("data-theme") !== t) host.setAttribute("data-theme", t);
  }

  /* ================= Панель: создание и монтирование ================= */

  function createHost() {
    host = document.createElement("div");
    host.id = "yts-panel-host";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style>${HTML}`;

    // Горячие клавиши YouTube не должны срабатывать, пока вы печатаете в панели
    ["keydown", "keyup", "keypress"].forEach((t) => root.addEventListener(t, (e) => e.stopPropagation()));

    bind();
    initStaticUi();
    applyTheme();
  }

  function mount() {
    if (!alive()) { clearInterval(timer); if (host) host.remove(); return; }

    if (location.pathname !== "/watch") {
      if (host && host.isConnected) host.remove();
      return;
    }
    const container = document.querySelector("#secondary-inner") || document.querySelector("#secondary");
    if (!container || !storeReady) return;

    if (!host) createHost();
    if (host.parentElement !== container || container.firstElementChild !== host) container.prepend(host);
    applyTheme();

    const vid = new URLSearchParams(location.search).get("v") || "";
    if (vid && vid !== state.videoId) onVideoChanged(vid);
  }

  function onVideoChanged(vid) {
    state.videoId = vid;
    state.title = "";
    state.tracks = [];
    state.translations = [];
    resetResult();
    q("aiCacheList").hidden = true;
    refreshAiCacheLink();
    setControlsEnabled(false);
    loadTracks(vid);
  }

  function resetResult() {
    state.cues = null;
    state.meta = null;
    state.aiRaw = "";
    state.previewReady = false;
    q("preview").hidden = true;
    q("preview").textContent = "";
    q("btnText").setAttribute("aria-pressed", "false");
    ["btnDl", "btnCopy", "btnText"].forEach((id) => (q(id).disabled = true));
    q("stat").textContent = "";
    q("outWrap").hidden = true;
    q("aiStat").textContent = "";
    q("aiStat").className = "";
  }

  function setControlsEnabled(on) {
    ["selTrack", "selFmt", "btnLoad", "btnAnalyze"].forEach((id) => (q(id).disabled = !on));
    if (!on) q("selTr").disabled = true;
  }

  /* ================= Статические части интерфейса ================= */

  function initStaticUi() {
    const sp = q("selPrompt");
    PROMPTS.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.label; sp.appendChild(o);
    });
    sp.value = PROMPTS.some((p) => p.id === state.ui.promptId) ? state.ui.promptId : "summary";
    applyPrompt();
    q("chkTs").checked = !!state.ui.withTs;
    q("selFmt").value = state.ui.format || "srt";

    const pp = q("aiPreset");
    Object.keys(AI_PRESETS).forEach((id) => {
      const o = document.createElement("option");
      o.value = id; o.textContent = AI_PRESETS[id].label; pp.appendChild(o);
    });
    if (!AI_PRESETS[state.ai.active]) state.ai.active = "anthropic";
    renderSettings();
    fillProxyForm(null);
    refreshProxyStatus();
    refreshProvLine();

    applyCollapsed();
    showPane(state.ui.pane || "subs", true);
  }

  function applyPrompt() {
    const id = q("selPrompt").value;
    const p = PROMPTS.find((x) => x.id === id) || PROMPTS[0];
    const ta = q("txtPrompt");
    ta.value = id === "custom" ? state.ui.customPrompt || "" : p.text;
    ta.placeholder = id === "custom" ? "Опишите, что нужно сделать с транскриптом…" : "";
    if (id === "custom") setPromptEditing(true);
  }

  function setPromptEditing(on) {
    q("txtPrompt").hidden = !on;
    q("btnPromptEdit").setAttribute("aria-pressed", String(on));
  }

  function applyCollapsed() {
    const c = !!state.ui.collapsed;
    q("body").hidden = c;
    q("btnCollapse").innerHTML = c ? ICON.chevronRight : ICON.chevron;
    q("btnCollapse").setAttribute("aria-expanded", String(!c));
    q("btnCollapse").title = c ? "Развернуть" : "Свернуть";
  }

  function showPane(name, silent = false) {
    if (name !== "set") state.ui.last = name;
    state.ui.pane = name;
    if (state.ui.collapsed && !silent) { state.ui.collapsed = false; applyCollapsed(); }

    q("paneSubs").hidden = name !== "subs";
    q("paneAI").hidden = name !== "ai";
    q("paneSet").hidden = name !== "set";
    q("tabSubs").setAttribute("aria-selected", String(name === "subs"));
    q("tabAI").setAttribute("aria-selected", String(name === "ai"));
    q("btnGear").setAttribute("aria-pressed", String(name === "set"));
    if (name === "set") {
      showSetTab(state.ui.setTab, true);
      renderSettings();
      refreshProxyStatus();
    }
    if (name === "ai") {
      refreshProvLine();
      refreshAiCacheLink();
    }
    if (!silent) saveUi();
  }

  const SET_TABS = {
    provider: ["tabSetProv", "paneSetProv"],
    proxy: ["tabSetProxy", "paneSetProxy"],
    io: ["tabSetIo", "paneSetIo"],
  };

  function showSetTab(name, silent = false) {
    const tab = SET_TABS[name] ? name : "provider";
    state.ui.setTab = tab;
    Object.entries(SET_TABS).forEach(([key, [tabId, paneId]]) => {
      const on = key === tab;
      q(paneId).hidden = !on;
      q(tabId).setAttribute("aria-selected", String(on));
    });
    if (!silent) saveUi();
  }

  function refreshProvLine() {
    const preset = AI_PRESETS[state.ai.active];
    const prof = profileFor(state.ai.active);
    q("lnkProv").textContent = `${preset.label} · ${prof.model || "модель не выбрана"}`;
  }

  /* ================= Обработчики ================= */

  function bind() {
    q("btnCollapse").onclick = () => { state.ui.collapsed = !state.ui.collapsed; applyCollapsed(); saveUi(); };
    q("tabSubs").onclick = () => showPane("subs");
    q("tabAI").onclick = () => showPane("ai");
    q("btnGear").onclick = () => showPane(state.ui.pane === "set" ? state.ui.last || "subs" : "set");
    q("lnkProv").onclick = () => { state.ui.setTab = "provider"; showPane("set"); };
    q("lnkAiCache").onclick = openAiCache;
    q("tabSetProv").onclick = () => showSetTab("provider");
    q("tabSetProxy").onclick = () => showSetTab("proxy");
    q("tabSetIo").onclick = () => showSetTab("io");
    q("tabSetProv").parentElement.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const order = ["provider", "proxy", "io"];
      const i = order.indexOf(SET_TABS[state.ui.setTab] ? state.ui.setTab : "provider");
      const next = order[(i + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length];
      showSetTab(next);
      q(SET_TABS[next][0]).focus();
      e.preventDefault();
    });
    q("btnDebug").onclick = () => send({ type: "openDebug", videoId: state.videoId });

    // Переключение вкладок стрелками
    q("tabSubs").parentElement.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const next = state.ui.pane === "ai" ? "subs" : "ai";
      showPane(next);
      q(next === "subs" ? "tabSubs" : "tabAI").focus();
    });

    q("selTrack").onchange = () => {
      const t = currentTrack();
      if (t) { state.ui.lang = t.languageCode; saveUi(); }
      renderTranslate();
      resetResult();
    };
    q("selTr").onchange = resetResult;
    q("btnLoad").onclick = () => loadTranscript();

    q("selFmt").onchange = () => { state.ui.format = q("selFmt").value; saveUi(); };
    q("btnDl").onclick = download;
    q("btnCopy").onclick = () => copyText(YTS.FORMATS[q("selFmt").value].build(state.cues), q("btnCopy"));
    q("btnText").onclick = togglePreview;

    q("selPrompt").onchange = () => {
      state.ui.promptId = q("selPrompt").value; saveUi();
      applyPrompt();
      if (state.ui.promptId !== "custom") setPromptEditing(false);
    };
    q("btnPromptEdit").onclick = () => setPromptEditing(q("txtPrompt").hidden);
    q("txtPrompt").oninput = () => {
      if (q("selPrompt").value === "custom") { state.ui.customPrompt = q("txtPrompt").value; saveUi(); }
    };
    q("chkTs").onchange = () => { state.ui.withTs = q("chkTs").checked; saveUi(); };
    q("btnAnalyze").onclick = analyze;
    q("btnCopyAI").onclick = () => copyText(state.aiRaw, q("btnCopyAI"));

    q("aiPreset").onchange = onPresetChange;
	q("aiModel").onchange = updateModelDescription;
    q("btnRefreshModels").onclick = refreshModels;
    q("btnModelManual").onclick = toggleManualModel;
    q("btnEye").onclick = () => {
      const i = q("aiToken");
      const show = i.type === "password";
      i.type = show ? "text" : "password";
      q("btnEye").innerHTML = show ? ICON.eyeOff : ICON.eye;
    };
    q("btnSaveAI").onclick = saveSettings;
    q("btnTestAI").onclick = testSettings;
    q("proxyEnabled").onchange = onProxyEnabled;
    q("proxyScheme").onchange = updateSocksHint;
    q("proxyUser").oninput = updateSocksHint;
    q("btnProxyEye").onclick = () => {
      const input = q("proxyPass");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      q("btnProxyEye").innerHTML = show ? ICON.eyeOff : ICON.eye;
    };
    q("btnProxyNew").onclick = () => {
      state.proxyEditing = null;
      fillProxyForm(null);
      renderProxyView();
    };
    q("btnProxySave").onclick = saveProxyItem;
    q("btnProxyCheck").onclick = checkSelectedProxy;
    q("btnProxyCheckAll").onclick = checkAllProxies;
    q("btnProxyStop").onclick = () => send({ type: "proxyCheckStop" });
    q("btnExport").onclick = exportSettings;
    q("btnImport").onclick = () => q("importFile").click();
    q("importFile").onchange = () => {
      const file = q("importFile").files && q("importFile").files[0];
      q("importFile").value = "";
      if (file) importSettings(file);
    };

    // Клик по таймкоду — перемотка видео
    root.addEventListener("click", (e) => {
      const t = e.target && e.target.closest && e.target.closest(".ts");
      if (!t) return;
      const v = document.querySelector("video.html5-main-video") || document.querySelector("video");
      if (v) v.currentTime = Number(t.dataset.t) || 0;
    });
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.innerHTML;
      btn.innerHTML = ICON.check;
      setTimeout(() => (btn.innerHTML = old), 1200);
    } catch (_) { setMsg("Не удалось скопировать в буфер обмена", "error"); }
  }

  /* ================= Сообщения ================= */

  function setMsg(text, kind = "") {
    const el = q("msg");
    el.textContent = text;
    el.className = "msg " + kind;
  }
  function setProgress(pct) {
    const el = q("prog");
    if (pct == null) {
      el.hidden = true;
      el.firstElementChild.style.width = "0";
      return;
    }
    el.hidden = false;
    el.firstElementChild.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }
  const statTimers = new Map();
  function setStat(id, text, kind = "") {
    const el = q(id);
    const prev = statTimers.get(id);
    if (prev) clearTimeout(prev);
    statTimers.delete(id);
    el.textContent = text;
    el.className = (id === "aiStat" ? "" : "stat ") + kind;
    if (kind === "ok" && text) {
      statTimers.set(id, setTimeout(() => {
        statTimers.delete(id);
        if (!root || q(id) !== el || !el.classList.contains("ok")) return;
        el.textContent = "";
        el.className = id === "aiStat" ? "" : "stat";
      }, 5000));
    }
  }
  const currentTrack = () => state.tracks[Number(q("selTrack").value)];
  const currentTlang = () => (q("selTr").disabled ? "" : q("selTr").value);

  /* ================= Дорожки ================= */

  async function loadTracks(vid) {
    const seq = ++state.loadSeq;
    setMsg("Читаю список субтитров…");

    let info = null;
    for (let i = 0; i < 8; i++) {
      const r = await send({ type: "getTracks" });
      if (seq !== state.loadSeq) return;
      if (!r.ok) return setMsg("Ошибка: " + r.error, "error");
      if (r.data && !r.data.error) {
        info = r.data;
        if (!info.videoId || info.videoId === vid) break;
      }
      await sleep(700);
    }
    if (seq !== state.loadSeq) return;
    if (!info || (info.videoId && info.videoId !== vid)) {
      return setMsg("Не удалось прочитать данные видео. Обновите страницу (F5).", "error");
    }

    state.title = info.title;
    state.tracks = info.tracks;
    state.translations = info.translationLanguages;

    if (!info.tracks.length) {
      const why = info.status && info.status !== "OK" ? ` (${info.reason || info.status})` : "";
      return setMsg("У этого видео нет субтитров или они недоступны" + why, "error");
    }
	setMsg("");
	renderTracks();
	setControlsEnabled(true);
	renderTranslate();

	// Восстанавливаем ранее полученный ответ для этого видео
	await restoreAIResult();
  }

  function renderTracks() {
    const sel = q("selTrack");
    sel.innerHTML = "";
    state.tracks.forEach((t, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = t.kind === "asr" ? `${t.name} (авто)` : t.name;
      sel.appendChild(o);
    });
    let idx = state.tracks.findIndex((t) => t.languageCode === state.ui.lang);
    if (idx < 0) idx = state.tracks.findIndex((t) => t.kind !== "asr");
    sel.value = String(idx >= 0 ? idx : 0);
  }

  function renderTranslate() {
    const t = currentTrack();
    const can = !!(t && t.isTranslatable && state.translations.length);
    const sel = q("selTr");
    sel.innerHTML = "";
    if (!can) {
      sel.innerHTML = "<option>—</option>";
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Без перевода</option>';
    state.translations.forEach((l) => {
      const o = document.createElement("option");
      o.value = l.languageCode; o.textContent = l.name; sel.appendChild(o);
    });
  }

  /* ================= Субтитры ================= */

  async function loadTranscript() {
    if (state.busy) return;
    const track = currentTrack();
    if (!track) return;

    state.busy = true;
    q("btnLoad").disabled = true;
    setMsg("");
    setProgress(4);
    const onProg = (e) => {
      const pct = e.detail && e.detail.pct;
      if (typeof pct === "number") setProgress(pct);
    };
    document.addEventListener("yts-subs-progress", onProg);
    try {
      const tlang = currentTlang();
      const r = await send({ type: "fetchSubs", baseUrl: track.baseUrl, tlang });
      if (!r.ok) throw new Error(r.error);
      const res = r.data;
      if (!res || !res.ok) throw new Error((res && res.error) || "нет ответа от страницы");

      const cues = YTS.parseCaptions(res.text);
      if (!cues.length) throw new Error("Не удалось разобрать ответ YouTube");

      const trName = tlang ? (state.translations.find((l) => l.languageCode === tlang) || {}).name || tlang : "";
      state.cues = cues;
      state.previewReady = false;
      state.meta = {
        lang: tlang || track.languageCode,
        label: track.name + (tlang ? ` → ${trName}` : "") + (track.kind === "asr" ? " (авто)" : ""),
      };
      renderResult();
      setMsg("");
    } catch (e) {
      setMsg(`Ошибка: ${e.message}. Подробности — в «Отладке» (иконка жука).`, "error");
    } finally {
      document.removeEventListener("yts-subs-progress", onProg);
      setProgress(null);
      state.busy = false;
      q("btnLoad").disabled = false;
    }
  }

	function renderResult() {
	  const cues = state.cues;
	  if (!cues || !cues.length) return;

	  const words = cues.reduce(
		(n, c) => n + c.text.split(/\s+/).filter(Boolean).length,
		0
	  );

	  setStat(
		"stat",
		`${state.meta.label} · ${cues.length} строк · ~${words} слов · ${YTS.clock(cues[cues.length - 1].end)}`
	  );

	  ["btnDl", "btnCopy", "btnText"].forEach(
		(id) => (q(id).disabled = false)
	  );

	  // Показываем текст автоматически
	  q("preview").hidden = false;
	  q("btnText").setAttribute("aria-pressed", "true");

	  renderPreview();
	}

  function togglePreview() {
    const box = q("preview");
    const show = box.hidden;
    box.hidden = !show;
    q("btnText").setAttribute("aria-pressed", String(show));
    if (show && !state.previewReady) renderPreview();
  }

  function renderPreview() {
    const box = q("preview");
    box.textContent = "";
    const frag = document.createDocumentFragment();
    for (const c of state.cues) {
      const s = document.createElement("span");
      s.className = "ts";
      s.dataset.t = String(Math.floor(c.start / 1000));
      s.textContent = YTS.clock(c.start);
      frag.append(s, " " + c.text.replace(/\n/g, " ") + "\n");
    }
    box.append(frag);
    state.previewReady = true;
  }

  function download() {
    if (!state.cues) return;
    const ext = q("selFmt").value;
    const f = YTS.FORMATS[ext];
    YTS.saveFile(`${YTS.safeFilename(state.title)} [${state.videoId}].${state.meta.lang}.${ext}`, f.build(state.cues), f.mime);
  }

  /* ================= Мини-рендер Markdown (безопасный, без innerHTML) ================= */

  const TS_RE = /\[(\d{1,2}(?::\d{2}){1,2})(?:\s*[–-]\s*\d{1,2}(?::\d{2}){1,2})?\]/;
  const INLINE_RE = new RegExp(
    "(\\*\\*[^*]+\\*\\*|`[^`]+`|\\*[^*\\s][^*]*\\*|" + TS_RE.source + ")", "g"
  );

  function clockToSec(s) {
    return s.split(":").map(Number).reduce((a, n) => a * 60 + n, 0);
  }

  function renderInline(parent, text) {
    let last = 0;
    for (const m of text.matchAll(INLINE_RE)) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      const tok = m[0];
      let el;
      if (tok.startsWith("**")) { el = document.createElement("strong"); renderInline(el, tok.slice(2, -2)); }
      else if (tok.startsWith("`")) { el = document.createElement("code"); el.textContent = tok.slice(1, -1); }
      else if (tok.startsWith("[")) {
        el = document.createElement("span");
        el.className = "ts"; el.dataset.t = String(clockToSec(m[2])); el.textContent = tok;
      } else { el = document.createElement("em"); renderInline(el, tok.slice(1, -1)); }
      parent.append(el);
      last = m.index + tok.length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }

  function renderMarkdown(container, text) {
    container.textContent = "";
    const mk = (tag) => document.createElement(tag);
    let list = null;
    let para = [];
    const flush = () => {
      if (!para.length) return;
      const p = mk("p");
      renderInline(p, para.join("\n"));
      container.append(p);
      para = [];
    };
    for (const raw of text.replace(/\r/g, "").split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flush(); list = null; continue; }
      if ((m = line.match(/^\s{0,3}#{1,6}\s+(.*)$/))) {
        flush(); list = null;
        const h = mk("h4"); renderInline(h, m[1]); container.append(h); continue;
      }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
        flush();
        if (!list || list.tagName !== "UL") { list = mk("ul"); container.append(list); }
        const li = mk("li"); renderInline(li, m[1]); list.append(li); continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flush();
        if (!list || list.tagName !== "OL") { list = mk("ol"); container.append(list); }
        const li = mk("li"); renderInline(li, m[1]); list.append(li); continue;
      }
      list = null;
      para.push(line.trim());
    }
    flush();
  }

  /* ================= ИИ-анализ ================= */

  const AI_LIMITS_KEY = "aiLimits";
  const AI_LIMIT_TTL = 24 * 60 * 60 * 1000; // выученный лимит считаем актуальным сутки
  let aiRun = null; // пока идёт анализ: { cancelled: boolean }

  // Выученные лимиты хранятся по ключу «провайдер|модель»: { tpm, k, at }
  async function loadAiLimit(key) {
    try {
      const d = await chrome.storage.local.get(AI_LIMITS_KEY);
      const rec = (d[AI_LIMITS_KEY] || {})[key] || {};
      const fresh = rec.at && Date.now() - rec.at < AI_LIMIT_TTL && rec.tpm > 0;
      return { tpm: fresh ? rec.tpm : 0, k: rec.k > 0 ? rec.k : 1, learned: !!fresh, at: rec.at || 0 };
    } catch (_) {
      return { tpm: 0, k: 1, learned: false, at: 0 };
    }
  }

  async function saveAiLimit(key, lim) {
    try {
      const d = await chrome.storage.local.get(AI_LIMITS_KEY);
      const all = d[AI_LIMITS_KEY] || {};
      all[key] = {
        tpm: lim.learned ? lim.tpm : 0,
        k: lim.k,
        at: lim.tpmChanged ? Date.now() : lim.at || Date.now(),
      };
      await chrome.storage.local.set({ [AI_LIMITS_KEY]: all });
    } catch (_) {}
  }

  function setAnalyzeBusy(on) {
    const span = q("btnAnalyze").querySelector(":scope > span");
    if (span) span.textContent = on ? "Отмена" : "Анализировать";
  }

  // Ожидание с обратным отсчётом; check() бросает исключение при отмене
  async function aiWait(check, ms, label) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      check();
      setStat("aiStat", `${label} ${Math.ceil((end - Date.now()) / 1000)} с…`);
      await sleep(Math.min(1000, Math.max(50, end - Date.now())));
    }
  }

  async function analyze() {
    // Повторный клик во время анализа = отмена (сработает между запросами)
    if (aiRun) {
      aiRun.cancelled = true;
      setStat("aiStat", "Отменяю…");
      return;
    }
    if (state.busy) return;

    const id = state.ai.active;
    const prof = profileFor(id);
    const preset = AI_PRESETS[id];
    const prompt = q("txtPrompt").value.trim();

    if (!prompt) {
      setPromptEditing(true);
      return setStat("aiStat", "Введите задачу для ИИ", "error");
    }

    if (!prof.url || !prof.model || (preset.needsKey && !prof.token)) {
      showPane("set");
      return setStat(
        "aiSetMsg",
        "Заполните и сохраните настройки API, затем повторите анализ.",
        "error"
      );
    }

    const run = { cancelled: false };
    aiRun = run;
    const vid = state.videoId; // видео, для которого запущен анализ
    const cacheBtn = q("lnkAiCache");
    setAnalyzeBusy(true);
    cacheBtn.disabled = true;
    q("outWrap").hidden = true;
    q("aiCacheList").hidden = true;

    // Бросает исключение, если нажали «Отмена» или перешли на другое видео
    const check = () => {
      if (vid !== state.videoId) {
        const e = new Error("Видео сменилось");
        e.cancelled = true;
        e.silent = true;
        throw e;
      }
      if (run.cancelled) {
        const e = new Error("Отменено");
        e.cancelled = true;
        throw e;
      }
    };

    const limKey = `${id}|${prof.model}`;
    let lim = null;

    try {
      if (!state.cues) {
        setStat("aiStat", "Получаю субтитры…");
        await loadTranscript();
        check();

        if (!state.cues) {
          setStat("aiStat", "");
          return;
        }
      }

      const sep = state.ui.withTs ? "\n" : " ";
      const cut = YTSChunk.limitChars(
        YTS.toAiLines(state.cues, state.ui.withTs),
        Number(state.ai.maxChars) || 200000,
        sep
      );
      const note = cut.truncated ? " · обрезано по лимиту" : "";

      const header =
        `Видео: ${state.title}\n` +
        `URL: https://www.youtube.com/watch?v=${state.videoId}\n` +
        `Субтитры: ${state.meta.label}`;

      // Запоминаем параметры, по которым будет идентифицироваться кэш
      const identity = getAIResultIdentity();

      // Лимит: вручную из настроек, иначе выученный по прошлым ошибкам (или 0 — неизвестен)
      lim = await loadAiLimit(limKey);
      const manual = Math.floor(Number(state.ai.maxInputTokens)) || 0;
      if (manual > 0) {
        lim.tpm = manual;
        lim.learned = false;
      }

      setStat("aiStat", `Отправляю ${cut.pieces.join(sep).length} симв.…${note}`);
      const t0 = Date.now();

      const out = await YTSChunk.summarize({
        system: AI_SYSTEM,
        task: prompt,
        header,
        pieces: cut.pieces,
        sep,
        buildSingle: (full) => `${prompt}\n\n---\n${header}\n\nТранскрипт:\n${full}`,
        finalOut: Number(state.ai.maxTokens) || 0,
        lim,
        send: (system, user, maxTokens) => send({ type: "analyze", system, user, maxTokens }),
        wait: (ms, label) => aiWait(check, ms, label),
        check,
        status: (t) => setStat("aiStat", t),
        now: () => Date.now(),
      });

      if (vid !== state.videoId) return; // пока считали, перешли на другое видео

      state.aiRaw = out.text;
      renderMarkdown(q("aiOut"), out.text);
      q("outWrap").hidden = false;

      // Сохраняем успешный ответ для повторного открытия видео
      await saveAIResult(identity, out.text);

      const parts = out.chunked ? ` · частей: ${out.parts}, запросов: ${out.calls}` : "";
      setStat(
        "aiStat",
        `Готово за ${((Date.now() - t0) / 1000).toFixed(1)} с${parts}${note}`,
        "ok"
      );

    } catch (e) {
      if (e.silent) return;
      if (e.cancelled) setStat("aiStat", "Отменено");
      else setStat("aiStat", "Ошибка: " + e.message, "error");
      refreshAiCacheLink();

    } finally {
      // Запоминаем выученный лимит и калибровку оценки токенов
      if (lim && (lim.learned || lim.kChanged)) await saveAiLimit(limKey, lim);
      aiRun = null;
      setAnalyzeBusy(false);
      cacheBtn.disabled = false;
    }
  }


  /* ================= Настройки API ================= */
  
  function onPresetChange() {
  // Сохраняем текущие значения формы для предыдущего провайдера.
  state.ai.profiles[state.ai.active] = readForm();

  // Переключаем провайдера.
  state.ai.active = q("aiPreset").value;

  // Загружаем его настройки.
  renderSettings();
  refreshProvLine();
}

  function readForm() {
    return {
      style: q("aiStyle").value,
      url: q("aiUrl").value.trim(),
      token: q("aiToken").value.trim(),
      model: q("aiModelCustom").hidden
        ? q("aiModel").value
        : q("aiModelCustom").value.trim(),
    };
  }

  function renderSettings() {
    const id = state.ai.active;
    const preset = AI_PRESETS[id];
    const prof = profileFor(id);

    q("aiPreset").value = id;
    q("aiHint").textContent = preset?.hint || "";
    q("aiStyle").value = prof.style;
    q("aiUrl").value = prof.url;
    q("aiToken").value = prof.token;
    q("aiToken").placeholder = preset.needsKey ? "токен API" : "не требуется";

    // Собираем резервный и ранее загруженный списки.
    const cacheKey = `${id}|${preset.modelsUrl || ""}`;
    const cached = state.modelCache[cacheKey]?.models || [];
    const models = [...new Set([...(preset.models || []), ...cached])];

    // Если сохранённой модели нет в списке, всё равно добавляем её.
    if (prof.model && !models.includes(prof.model)) {
      models.push(prof.model);
    }

    const select = q("aiModel");
    select.innerHTML = "";

    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      select.appendChild(option);
    });

    select.value = prof.model || models[0] || "";

    q("aiModelCustom").value = prof.model || "";
    q("aiModelCustom").hidden = true;
    select.hidden = false;
    q("btnRefreshModels").hidden = !preset.modelsUrl;
    q("btnModelManual").textContent = "Ввести ID вручную";

    updateModelDescription();

    q("aiMaxTokens").value = state.ai.maxTokens || "";
    q("aiMaxChars").value = state.ai.maxChars || 200000;
    q("aiMaxInTok").value = state.ai.maxInputTokens || "";
    renderProxyView();
  }

  function updateModelDescription() {
    const model = q("aiModel").value;
    q("aiModelDesc").textContent = AI_MODEL_INFO[model] || "";
  }

  function toggleManualModel() {
    const select = q("aiModel");
    const input = q("aiModelCustom");
    const refresh = q("btnRefreshModels");
    const manual = input.hidden;

    if (manual) {
      input.value = select.value;
      select.hidden = true;
      refresh.hidden = true;
      input.hidden = false;
      q("btnModelManual").textContent = "Выбрать из списка";
      q("aiModelDesc").textContent = "";
      input.focus();
    } else {
      const value = input.value.trim();

      if (value && ![...select.options].some((o) => o.value === value)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      }

      if (value) select.value = value;

      input.hidden = true;
      select.hidden = false;
      refresh.hidden = !AI_PRESETS[state.ai.active].modelsUrl;
      q("btnModelManual").textContent = "Ввести ID вручную";
      updateModelDescription();
    }
  }

  async function refreshModels() {
    const id = state.ai.active;
    const preset = AI_PRESETS[id];
    const btn = q("btnRefreshModels");

    if (!preset.modelsUrl) {
      return setStat("aiSetMsg", "Для этого провайдера обновление списка не настроено", "error");
    }

    const profile = readForm();

    if (preset.needsKey && !profile.token) {
      return setStat("aiSetMsg", "Сначала укажите API-токен", "error");
    }

    btn.disabled = true;
    btn.classList.add("loading");
    setStat("aiSetMsg", "Получаю список моделей…");

    try {
      const r = await send({
        type: "getAIModels",
        provider: id,
        profile,
      });

      if (!r.ok) throw new Error(r.error);

      const result = r.data;

      if (!result || !result.models?.length) {
        throw new Error("Список моделей пуст");
      }

      const cacheKey = `${id}|${preset.modelsUrl}`;

      state.modelCache[cacheKey] = {
        models: result.models,
        updatedAt: Date.now(),
      };

      // Сохраняем текущие значения формы, чтобы не потерять несохранённые изменения.
      state.ai.profiles[id] = profile;

      renderSettings();

      if (result.cached) {
        setStat(
          "aiSetMsg",
          result.warning || "Используется сохранённый список моделей",
          "error"
        );
      } else {
        setStat(
          "aiSetMsg",
          `Список обновлён · ${result.models.length} моделей`,
          "ok"
        );
      }

    } catch (e) {
      setStat("aiSetMsg", "Ошибка: " + e.message, "error");

    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }

  async function persistAi() {
    state.ai.profiles[state.ai.active] = readForm();
    state.ai.maxTokens = q("aiMaxTokens").value ? Number(q("aiMaxTokens").value) : "";
    state.ai.maxChars = Number(q("aiMaxChars").value) || 200000;
    state.ai.maxInputTokens = Math.max(0, Math.floor(Number(q("aiMaxInTok").value) || 0));
    await chrome.storage.local.set({ ai: state.ai });
    refreshProvLine();
    if (state.proxy.enabled) {
      const applied = await send({ type: "applyProxy" });
      state.proxyRuntime = applied.ok ? applied : state.proxyRuntime;
      renderProxyView();
      if (!applied.ok) setStat("proxyMsg", applied.error, "error");
      else if (applied.message) setStat("proxyMsg", applied.message, "");
    }
  }

  async function saveSettings() {
    if (!/^https?:\/\//i.test(readForm().url)) return setStat("aiSetMsg", "URL должен начинаться с http:// или https://", "error");
    try {
      await persistAi();
      setStat("aiSetMsg", "Сохранено", "ok");
    } catch (e) {
      setStat("aiSetMsg", "Не удалось сохранить: " + e.message, "error");
    }
  }

  async function testSettings() {
    const f = readForm();
    if (!/^https?:\/\//i.test(f.url)) return setStat("aiSetMsg", "URL должен начинаться с http:// или https://", "error");
    if (!f.model) return setStat("aiSetMsg", "Укажите модель", "error");
    const btn = q("btnTestAI");
    btn.disabled = true;
    setStat("aiSetMsg", "Проверяю соединение…");
    try {
      await persistAi();
      const r = await send({ type: "testAI" });
      if (!r.ok) throw new Error(r.error);
      setStat("aiSetMsg", `Работает. Ответ модели: «${r.data.text.trim().slice(0, 60)}»`, "ok");
    } catch (e) {
      setStat("aiSetMsg", "Ошибка: " + e.message, "error");
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= Прокси и перенос настроек ================= */

  function currentProxyItem() {
    const id = state.proxyEditing || state.proxy.activeId;
    return state.proxy.items.find((item) => item.id === id) || null;
  }

  function proxyCheckingNow() {
    return state.proxyChecking || !!(state.proxyCheck && state.proxyCheck.running);
  }

  function testingProxyId() {
    if (!proxyCheckingNow()) return "";
    const check = state.proxyCheck;
    if (check && check.running && check.currentId) return check.currentId;
    if (state.proxyCheckKind === "one") return state.proxyCheckId || "";
    return "";
  }

  function updateSocksHint() {
    const scheme = q("proxyScheme").value;
    const user = q("proxyUser").value.trim();
    q("proxySocksHint").textContent = scheme === "socks4" && user
      ? "Для SOCKS4 Chrome может не передать пароль."
      : "";
  }

  function checkLine(item) {
    const last = item.lastCheck;
    if (!last) return "не проверялся";
    const parts = [YTSProxy.statusLabel(last.status)];
    if (last.latencyMs != null) parts.push(last.latencyMs + " мс");
    if (last.ip) parts.push(last.ip);
    if (last.error && last.status === "error") parts.push(last.error);
    if (last.checkedAt) {
      const date = new Date(last.checkedAt);
      if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleString("ru-RU"));
    }
    return parts.join(" · ");
  }

  function proxyMark(item) {
    const last = item.lastCheck;
    if (!last || !["ok", "connect", "auth", "timeout", "error"].includes(last.status)) return null;
    const ok = last.status === "ok";
    const mark = document.createElement("span");
    mark.className = "px-mark " + (ok ? "ok" : "bad");
    mark.title = YTSProxy.statusLabel(last.status);
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = ok ? ICON.check : ICON.cross;
    return mark;
  }

  function fillProxyForm(item) {
    q("proxyName").value = item ? item.name : "";
    q("proxyScheme").value = item ? item.scheme : "http";
    q("proxyHost").value = item ? item.host : "";
    q("proxyPort").value = item ? String(item.port) : "";
    q("proxyUser").value = item ? item.username : "";
    q("proxyPass").value = item ? item.password : "";
    q("proxyPass").type = "password";
    q("btnProxyEye").innerHTML = ICON.eye;
    updateSocksHint();
  }

  function renderProxyView() {
    const checking = proxyCheckingNow();
    const running = checking || state.proxyBusy;
    const active = state.proxy.items.find((item) => item.id === state.proxy.activeId);
    const runtime = state.proxyRuntime || {};
    let status = "Прокси выключен";
    if (state.proxy.enabled && active) {
      status = "Включён · " + YTSProxy.SCHEME_LABELS[active.scheme] + " " + active.host + ":" + active.port;
    } else if (state.proxy.enabled) {
      status = "Прокси включён, но сервер не выбран";
    }
    if (runtime.level === "controlled_by_other_extensions" || runtime.level === "not_controllable") {
      status += ". Прокси Chrome сейчас занимает другое расширение или политика";
    }
    if (runtime.localOnly) status += ". Локальный API идёт напрямую";
    if (runtime.socks4Auth) status += ". Пароль SOCKS4 может не передаться";
    const check = state.proxyCheck;
    if (running && check) {
      status = "Проверено " + (check.index || 0) + " из " + (check.total || 0);
    } else if (check && check.total) {
      status += ". Работают: " + (check.ok || 0) + ", не работают: " + (check.bad || 0);
      if (check.stopped) status += ". Проверка остановлена";
      if (check.error) status += ". " + check.error;
    }
    q("proxyStatus").textContent = status;
    q("proxyEnabled").checked = !!state.proxy.enabled;
    q("proxyEnabled").disabled = running;
    ["proxyName", "proxyScheme", "proxyHost", "proxyPort", "proxyUser", "proxyPass", "btnProxyEye", "btnProxyNew", "btnProxySave", "btnExport", "btnImport"].forEach((id) => {
      q(id).disabled = running;
    });
    q("btnProxyCheck").disabled = running || !state.proxy.items.length;
    q("btnProxyCheckAll").disabled = running || !state.proxy.items.length;
    q("btnProxyStop").disabled = !checking;

    const list = q("proxyList");
    const testingId = testingProxyId();
    list.classList.toggle("busy", !!testingId);
    list.replaceChildren();
    if (!state.proxy.items.length) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "Сохранённых прокси пока нет";
      list.appendChild(empty);
      return;
    }
    state.proxy.items.forEach((item) => {
      const testing = item.id === testingId;
      const row = document.createElement("div");
      row.className = "px-row" + (item.id === state.proxy.activeId ? " active" : "") + (testing ? " testing" : "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "px-item";
      btn.disabled = running;
      if (testing) btn.setAttribute("aria-busy", "true");
      const name = document.createElement("span");
      name.className = "name";
      const mark = proxyMark(item);
      if (mark) name.append(mark);
      name.append(YTSProxy.displayName(item) + (item.id === state.proxy.activeId ? " · активный" : ""));
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = YTSProxy.SCHEME_LABELS[item.scheme] + " " + item.host + ":" + item.port + " · " +
        (testing ? "проверяется…" : checkLine(item));
      btn.append(name, sub);
      if (testing) {
        const prog = document.createElement("span");
        prog.className = "px-prog";
        prog.setAttribute("aria-hidden", "true");
        prog.appendChild(document.createElement("span"));
        btn.append(prog);
      }
      btn.onclick = () => selectProxy(item.id);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ibtn";
      del.title = "Удалить прокси";
      del.setAttribute("aria-label", "Удалить " + YTSProxy.displayName(item));
      del.innerHTML = ICON.trash;
      del.disabled = running;
      del.onclick = (e) => {
        e.stopPropagation();
        deleteProxyItem(item.id);
      };
      row.append(btn, del);
      list.appendChild(row);
    });
  }

  async function refreshProxyStatus() {
    const result = await send({ type: "proxyStatus" });
    if (!result.ok || !root) return;
    state.proxyRuntime = result;
    if (result.check) state.proxyCheck = result.check;
    renderProxyView();
  }

  async function saveProxyAndApply() {
    const payload = {
      enabled: !!state.proxy.enabled && !!state.proxy.activeId,
      activeId: state.proxy.activeId,
      items: state.proxy.items,
    };
    if (state.proxyCheck) payload.check = state.proxyCheck;
    state.proxy.enabled = payload.enabled;
    state.proxyBusy = true;
    renderProxyView();
    try {
      await chrome.storage.local.set({ proxy: payload });
      const applied = await send({ type: "applyProxy" });
      if (!applied.ok) throw new Error(applied.error);
      state.proxyRuntime = applied;
      return applied;
    } finally {
      state.proxyBusy = false;
      renderProxyView();
    }
  }

  async function onProxyEnabled() {
    if (q("proxyEnabled").checked && !state.proxy.activeId) {
      q("proxyEnabled").checked = false;
      setStat("proxyMsg", "Сначала выберите или сохраните прокси", "error");
      return;
    }
    state.proxy.enabled = q("proxyEnabled").checked;
    try {
      const applied = await saveProxyAndApply();
      if (applied.socks4Auth) setStat("proxyMsg", "Chrome может не передать пароль для SOCKS4", "error");
      else if (applied.message) setStat("proxyMsg", applied.message, "");
      else setStat("proxyMsg", state.proxy.enabled ? "Прокси включён" : "Прокси выключен, прежние настройки Chrome восстановлены", "ok");
    } catch (e) {
      setStat("proxyMsg", e.message, "error");
    }
  }

  async function selectProxy(id) {
    if (proxyCheckingNow() || state.proxyBusy) return;
    state.proxyEditing = id;
    state.proxy.activeId = id;
    fillProxyForm(state.proxy.items.find((item) => item.id === id) || null);
    try {
      await saveProxyAndApply();
      setStat("proxyMsg", "Активный прокси выбран", "ok");
    } catch (e) {
      setStat("proxyMsg", e.message, "error");
    }
  }

  async function saveProxyItem() {
    if (proxyCheckingNow() || state.proxyBusy) return;
    const prev = state.proxy.items.find((item) => item.id === state.proxyEditing);
    let item;
    try {
      item = YTSProxy.normalizeItem({
        id: state.proxyEditing || undefined,
        name: q("proxyName").value,
        scheme: q("proxyScheme").value,
        host: q("proxyHost").value,
        port: Number(q("proxyPort").value),
        username: q("proxyUser").value,
        password: q("proxyPass").value,
      });
    } catch (e) {
      setStat("proxyMsg", e.message, "error");
      return;
    }
    if (YTSProxy.isDuplicate(state.proxy.items, item, item.id)) {
      setStat("proxyMsg", "Такой прокси уже есть в списке", "error");
      return;
    }
    if (prev && prev.lastCheck && YTSProxy.proxyKey(prev) === YTSProxy.proxyKey(item) && prev.password === item.password) {
      item.lastCheck = prev.lastCheck;
    }
    state.proxy.items = state.proxy.items.filter((entry) => entry.id !== item.id).concat(item);
    state.proxy.activeId = item.id;
    state.proxyEditing = item.id;
    try {
      const applied = await saveProxyAndApply();
      fillProxyForm(item);
      if (applied.socks4Auth) setStat("proxyMsg", "Прокси сохранён. Chrome может не передать пароль для SOCKS4", "error");
      else setStat("proxyMsg", "Прокси сохранён", "ok");
    } catch (e) {
      setStat("proxyMsg", e.message, "error");
    }
  }

  async function deleteProxyItem(id) {
    if (proxyCheckingNow() || state.proxyBusy) return;
    if (!id || !state.proxy.items.some((item) => item.id === id)) return;
    const editingDeleted = state.proxyEditing === id;
    state.proxy.items = state.proxy.items.filter((item) => item.id !== id);
    if (state.proxy.activeId === id) state.proxy.activeId = state.proxy.items[0] ? state.proxy.items[0].id : null;
    if (!state.proxy.activeId) state.proxy.enabled = false;
    if (editingDeleted) state.proxyEditing = null;
    try {
      await saveProxyAndApply();
      if (editingDeleted) fillProxyForm(null);
      setStat("proxyMsg", "Прокси удалён", "ok");
    } catch (e) {
      setStat("proxyMsg", e.message, "error");
    }
  }

  function formatCheckResult(result) {
    if (!result) return "Проверка остановлена";
    const parts = [YTSProxy.statusLabel(result.status)];
    if (result.latencyMs != null) parts.push(result.latencyMs + " мс");
    if (result.ip) parts.push("IP " + result.ip);
    if (result.error && result.status === "error") parts.push(result.error);
    return parts.join(" · ");
  }

  async function checkSelectedProxy() {
    const id = state.proxyEditing || state.proxy.activeId;
    if (!id) {
      setStat("proxyMsg", "Выберите прокси", "error");
      return;
    }
    state.proxyChecking = true;
    state.proxyCheckKind = "one";
    state.proxyCheckId = id;
    renderProxyView();
    setStat("proxyMsg", "Проверяю прокси…");
    try {
      const result = await send({ type: "proxyCheckOne", id });
      if (!result.ok) throw new Error(result.error);
      const fresh = await chrome.storage.local.get("proxy");
      state.proxy = YTSProxy.normalizeProxyState(fresh.proxy);
      state.proxyCheck = fresh.proxy && fresh.proxy.check || null;
      setStat("proxyMsg", formatCheckResult(result.result), result.result && result.result.status === "ok" ? "ok" : "error");
    } catch (e) {
      setStat("proxyMsg", e.message, "error");
    } finally {
      state.proxyChecking = false;
      state.proxyCheckKind = "";
      state.proxyCheckId = "";
      renderProxyView();
      refreshProxyStatus();
    }
  }

  async function checkAllProxies() {
    if (!state.proxy.items.length) {
      setStat("proxyMsg", "Список прокси пуст", "error");
      return;
    }
    if (!confirm("На время проверки настройки прокси Chrome временно подменяются и затем восстанавливаются. Продолжить?")) return;
    state.proxyChecking = true;
    state.proxyCheckKind = "all";
    renderProxyView();
    setStat("proxyMsg", "Проверяю список… 0 из " + state.proxy.items.length);
    try {
      const result = await send({ type: "proxyCheckAll" });
      if (!result.ok) throw new Error(result.error);
      const fresh = await chrome.storage.local.get("proxy");
      state.proxy = YTSProxy.normalizeProxyState(fresh.proxy);
      state.proxyCheck = fresh.proxy && fresh.proxy.check || null;
      const summary = result.summary || {};
      const prefix = summary.stopped ? "Проверка остановлена" : "Проверка завершена";
      setStat("proxyMsg", prefix + ". Работают: " + (summary.working || 0) + ", не работают: " + (summary.failed || 0), summary.failed ? "error" : "ok");
    } catch (e) {
      setStat("proxyMsg", e.message, "error");
    } finally {
      state.proxyChecking = false;
      state.proxyCheckKind = "";
      renderProxyView();
      refreshProxyStatus();
    }
  }

  async function exportSettings() {
    if (!confirm("Файл содержит API-ключи и пароли прокси. Эти данные в расширении не шифруются. Не передавайте файл посторонним.")) return;
    try {
      state.ai.profiles[state.ai.active] = readForm();
      state.ai.maxTokens = q("aiMaxTokens").value ? Number(q("aiMaxTokens").value) : "";
      state.ai.maxChars = Number(q("aiMaxChars").value) || 200000;
      state.ai.maxInputTokens = Math.max(0, Math.floor(Number(q("aiMaxInTok").value) || 0));
      const proxy = {
        enabled: !!state.proxy.enabled,
        activeId: state.proxy.activeId,
        items: state.proxy.items,
      };
      await chrome.storage.local.set({ ai: state.ai, ui: state.ui, proxy });
      const doc = YTSProxy.exportDocument(state.ui, state.ai, proxy, new Date().toISOString());
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "yt-subtitles-settings.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      refreshProvLine();
      setStat("ioMsg", "Файл настроек сохранён", "ok");
    } catch (e) {
      setStat("ioMsg", e.message, "error");
    }
  }

  async function importSettings(file) {
    let parsed;
    try {
      parsed = YTSProxy.parseImport(await file.text());
    } catch (e) {
      setStat("ioMsg", e.message, "error");
      return;
    }
    const summary = parsed.summary;
    const active = summary.activeName ? ", активный: " + summary.activeName : "";
    const mode = summary.enabled ? "включён в файле" : "выключен в файле";
    const proxyAddresses = parsed.proxy.items.map((item) =>
      "  • " + item.scheme.toUpperCase() + " " + item.host + ":" + item.port
    );
    const addressPreview = proxyAddresses.length
      ? "\nАдреса прокси:\n" + proxyAddresses.slice(0, 8).join("\n") +
        (proxyAddresses.length > 8 ? "\n  … и ещё " + (proxyAddresses.length - 8) : "")
      : "";
    const agreed = confirm(
      "Найдено: провайдер «" + summary.provider + "», профилей API: " + summary.profiles +
      ", прокси: " + summary.proxies + " (" + mode + active + ")." + addressPreview +
      "\n\nНастройки будут заменены. Импортированные прокси сохранятся в списке, но будут выключены. Продолжить?"
    );
    if (!agreed) return;
    try {
      // Do not activate an imported proxy automatically: the user should review
      // its address and credentials before routing requests through it.
      parsed.proxy.enabled = false;
      await chrome.storage.local.set({ ui: parsed.ui, ai: parsed.ai, proxy: parsed.proxy });
      state.ui = Object.assign({
        collapsed: false, pane: "subs", last: "subs", setTab: "provider", format: "srt", promptId: "summary", customPrompt: "", withTs: true, lang: "",
      }, parsed.ui);
      state.ai = parsed.ai;
      state.ai.profiles = state.ai.profiles || {};
      if (!AI_PRESETS[state.ai.active]) state.ai.active = "anthropic";
      state.proxy = parsed.proxy;
      state.proxyCheck = null;
      state.proxyEditing = null;
      applyPrompt();
      q("chkTs").checked = !!state.ui.withTs;
      q("selFmt").value = state.ui.format || "srt";
      renderSettings();
      fillProxyForm(null);
      showSetTab(state.ui.setTab, true);
      refreshProvLine();
      const applied = await send({ type: "applyProxy" });
      state.proxyRuntime = applied.ok ? applied : state.proxyRuntime;
      renderProxyView();
      if (!applied.ok) setStat("ioMsg", "Настройки записаны, но прокси не применён: " + applied.error, "error");
      else setStat("ioMsg", "Настройки импортированы", "ok");
    } catch (e) {
      setStat("ioMsg", "Импорт не применён: " + e.message, "error");
    }
  }

  /* ================= Запуск ================= */

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.proxy || !root) return;
    const value = changes.proxy.newValue || {};
    state.proxy = YTSProxy.normalizeProxyState(value);
    state.proxyCheck = value.check || null;
    if (state.proxyEditing && !state.proxy.items.some((item) => item.id === state.proxyEditing)) {
      state.proxyEditing = null;
      fillProxyForm(null);
    }
    renderProxyView();
    if (state.proxyCheckKind === "all" && state.proxyCheck && state.proxyCheck.running) {
      const total = state.proxyCheck.total || state.proxy.items.length;
      setStat("proxyMsg", "Проверяю список… " + (state.proxyCheck.index || 0) + " из " + total);
    }
  });

  loadStore().then(() => {
    mount();
    document.addEventListener("yt-navigate-finish", mount);
    document.addEventListener("yt-page-data-updated", mount);
    timer = setInterval(mount, 1000);
    // Быстрая реакция на смену темы (YouTube / Dark Reader)
    new MutationObserver(applyTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dark", "data-darkreader-mode", "data-darkreader-scheme", "class", "style"],
    });
  });
})();