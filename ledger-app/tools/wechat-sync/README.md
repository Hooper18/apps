# wechat-sync：把电脑微信里的微信支付付款同步到口袋记账

只读电脑微信本地库里「微信支付」服务号这一个会话，把新付款（商户、人民币金额、标价、时间、交易号）发给口袋记账的后端入口。

- 原库文件只读取，不修改。
- 解密在内存里完成，磁盘上不落明文。
- 不注入微信进程，不走微信协议。

## 前提

- Windows，电脑微信 4.x 已登录过要同步的账号。
- 已经用别的工具取到这个账号的库密钥（一个 JSON，里面有 `message\biz_message_0.db` 的 `enc_key` 和 `salt`）。本工具不负责取密钥。
- Python 3.11 以上（用到 `sqlite3` 的 `deserialize`）。

## 安装

```bash
python -m venv .venv
```

```bash
.venv\Scripts\python -m pip install -r requirements.txt
```

把 `config.example.json` 复制成 `config.json` 并填好。`config.json`、`state.json`、`sync.log` 都在 `.gitignore` 里，不要提交。

| 字段 | 含义 |
|---|---|
| `db_path` | 微信的 `biz_message_0.db` 路径 |
| `keys_path` | 存密钥的 JSON 路径 |
| `key_name` | 密钥 JSON 里这个库的键名，一般是 `message\biz_message_0.db` |
| `endpoint` | 后端入口地址（App → 设置 → 自动记账 页面底部） |
| `token` | 个人令牌（同一页生成） |

## 用法

```bash
.venv\Scripts\python -m wxpay_sync.sync
```

| 参数 | 作用 |
|---|---|
| （无） | 同步新付款 |
| `--dry-run` | 只打印要发什么，不发送，不动游标 |
| `--since 2026-11-01` | 从这天起补发 |
| `--learn` | 把全部历史付款发去学习「商户归哪一类」，不入账 |
| `--watch` | 常驻：盯着微信的库文件，一有变化就同步；出错只记日志，不退出 |

第一次运行只把起点定在当下，之前的付款不入账。之后每次运行会重新看一遍「游标前 7 天」内的付款：电脑关机期间的付款是开机后才同步进本地库的，时间却是付款当时，只看游标之后会漏。后端确认过的交易号记在 `state.json` 的 `sent` 里，不会重发；没确认过的才发，后端再按交易号去重兜底。

`--watch` 每 2 秒看一次库文件和 WAL 的修改时间，变了就等 1.5 秒再同步，两次同步至少隔 5 秒，文件一直不变也每 10 分钟同步一次。这个库里还有别的服务号消息，所以触发会比较勤，每次要把整个库在内存里解密一遍。

退出码 0 成功，1 失败；每次运行的结果追加到 `sync.log`。

## 测试

```bash
.venv\Scripts\python -m unittest discover -s tests -t .
```

测试不碰真实的微信数据：解析用脱敏样例，解密用自造的加密页做往返。

## 结构

| 文件 | 作用 |
|---|---|
| `wxpay_sync/decrypt.py` | 解密微信 4.x 的库页（SQLCipher 4 格式），合并 WAL |
| `wxpay_sync/store.py` | 读「微信支付」会话那一张表，解 zstd |
| `wxpay_sync/parse.py` | 把一条消息解析成一笔付款，中英文界面都支持 |
| `wxpay_sync/sync.py` | 命令行入口：游标、发送、日志 |

## 已知限制

- 微信升级后库格式、表结构或密钥变了会失败，工具会报错而不是静默跳过。
- 转账和红包不在「微信支付」会话里，这个工具现在不读它们。
- 认的付款类型：已支付、已扣费（自动扣款）、已续费（订阅）、英文界面的 paid、少数标题为「微信支付凭证」的。退款不记。
- 付款后要等微信把消息写进本地库才读得到，延迟多久没有实测过。
