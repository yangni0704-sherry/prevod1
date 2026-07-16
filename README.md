# Prevod

说中文 / 英文 → 得到斯洛文尼亚语 + 法语。说法语 → 得到中文 + 英文。

单页 PWA(`index.html`)+ Netlify Functions。和 Govori 是**完全独立的站点**,
只共用同一个 Supabase 项目(所以 Govori 的账号在这里可以直接登录)。

## 结构

```
index.html              ← 全部前端(HTML+CSS+JS 单文件)
manifest.json / sw.js   ← PWA
netlify.toml            ← publish=".",无构建步骤
package.json            ← 只依赖 @supabase/supabase-js
netlify/functions/
├── _auth.js            ← 共享登录令牌验证
├── _quota.js           ← 每日 token 上限(单一上限,无付费层)
├── anthropic.js        ← Anthropic 代理(翻译)
├── azure-stt.js        ← 语音识别(?lang= 白名单)
└── azure-tts.js        ← 语音合成(试听)
```

## 环境变量(配在 Netlify 后台,不要写进代码)

Site configuration → Environment variables。**6 个**,值和 Govori 站点完全相同,
从那边复制即可。Stripe 那两个这里不需要——翻译不做订阅。

| 变量名 | 用途 |
|--------|------|
| `ANTHROPIC_API_KEY` | Anthropic 密钥 |
| `AZURE_SPEECH_KEY` | Azure 语音密钥 |
| `AZURE_SPEECH_REGION` | Azure 区域(westeurope) |
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | Supabase 匿名公钥 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务角色密钥(记账写库,机密) |

## 额度

`_quota.js` 里 `DAILY_CAP = 60000` tokens/天/用户,约 150+ 次翻译。
记账写进 Supabase 现有的 `usage_daily` 表,`module` 固定为 `'tr'`,
所以和 Govori 的用量天然分开,**不需要建新表或跑新 SQL**。

## 模型

`claude-opus-4-8`,`effort: low`,不开 thinking——翻译不需要推理,这样延迟最低。
一次调用同时返回两个目标语言,用 structured output(json_schema)保证格式。

## 几条铁律(继承自 Govori,踩过坑)

1. **改 SHELL 里的资源要 bump `sw.js` 的 `CACHE` 版本号**,否则用户拿到旧缓存。
   同理,**SHELL 里列的文件必须真实存在**——`addAll()` 遇到 404 会导致整个
   service worker 装不上,再也无法更新。
2. **一次性初始化调用放在脚本末尾的 init 块里**。这个单文件 JS 是顺序执行的,
   在上方引用下方定义的 `const`/`let` 会触发 TDZ,导致从那行往下静默全挂。
3. **交付前跑加载崩溃检测**,语法检查看不出 TDZ 这类运行时崩溃。
4. 密钥永远只在 Netlify 后台,不进代码、不进文档。
