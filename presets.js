
"use strict";

// Пресеты провайдеров ИИ.
// modelsUrl — адрес API для получения списка моделей.
// models — резервный список, если API ещё не вызывали или он недоступен.

const AI_PRESETS = {
  anthropic: {
    label: "Anthropic (Claude)",
    style: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    modelsUrl: "https://api.anthropic.com/v1/models",
    model: "claude-sonnet-5-5",
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
    needsKey: true,
    hint: "Ключ создаётся в консоли Anthropic (раздел API keys).",
  },
  openai: {
    label: "OpenAI",
    style: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    modelsUrl: "https://api.openai.com/v1/models",
    model: "",
    models: [],
    needsKey: true,
    hint: "Укажите модель, доступную в вашем аккаунте.",
  },
  openrouter: {
    label: "OpenRouter",
    style: "openai",
    url: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    model: "",
    models: [],
    needsKey: true,
    hint: "Модель указывается вместе с провайдером.",
  },
  groq: {
    label: "Groq",
    style: "openai",
    url: "https://api.groq.com/openai/v1/chat/completions",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    model: "openai/gpt-oss-120b",
    models: ["openai/gpt-oss-120b"],
    needsKey: true,
    hint: "Список моделей загружается из Groq. Можно также указать ID вручную.",
  },
  deepseek: {
    label: "DeepSeek",
    style: "openai",
    url: "https://api.deepseek.com/chat/completions",
    modelsUrl: "https://api.deepseek.com/models",
    model: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    needsKey: true,
    hint: "",
  },
  ollama: {
    label: "Ollama (локально)",
    style: "openai",
    url: "http://localhost:11434/v1/chat/completions",
    modelsUrl: "http://localhost:11434/api/tags",
    model: "",
    models: [],
    needsKey: false,
    hint: "Токен не нужен. Ollama должна принимать запросы расширений.",
  },
  custom: {
    label: "Свой вариант",
    style: "openai",
    url: "",
    modelsUrl: "",
    model: "",
    models: [],
    needsKey: false,
    hint: "Укажите полный URL эндпоинта и выберите тип API. Список моделей можно задать вручную.",
  },
};

// Краткие описания известных моделей.
// Если ID отсутствует в словаре, расширение просто покажет его название.
const AI_MODEL_INFO = {
  "openai/gpt-oss-120b": "120B · мощная модель для сложных задач и рассуждений",
  "openai/gpt-oss-20b": "20B · более быстрая и лёгкая модель",
  "groq/compound": "Модель Groq с дополнительными инструментами",
  "groq/compound-mini": "Облегчённая версия Compound",
  "deepseek-chat": "Универсальная модель DeepSeek",
  "deepseek-reasoner": "Модель DeepSeek для задач с рассуждением",
  "claude-sonnet-5-5": "Сбалансированная модель Claude",
  "claude-opus-5-5": "Модель Claude для сложных задач",
  "claude-haiku-5-5": "Быстрая и компактная модель Claude",
};

function aiPresetDefaults(id) {
  const p = AI_PRESETS[id] || AI_PRESETS.custom;
  return { style: p.style, url: p.url, model: p.model, token: "" };
}
