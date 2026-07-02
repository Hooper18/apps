# 数模国赛 AI 协作工具箱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `cumcm-toolkit/` 下产出一套工具无关（Codex/Claude 通用）的国赛备赛工具箱：语料分析、论文模板、建模代码脚手架、合规清单、AI 建模方案与正文起草能力，以及一次端到端集成验证。

**Architecture:** 纯文件产出（markdown + Python + LaTeX/docx），无服务/无部署。`AGENTS.md` 是 Codex 的核心入口，`.claude/skills/` 镜像同一套内容供 Claude Code 使用。语料原文不进 git，分析/模板/脚手架/清单进 git。

**Tech Stack:** Python 3（numpy/pandas/scipy/networkx/statsmodels/python-docx/pytest）、LaTeX（pdflatex）、Markdown。

## Global Constraints

- 语料原文（`corpus/` 下所有文件）禁止提交到 git；仓库需要一条 `.gitignore` 规则覆盖 `cumcm-toolkit/corpus/`
- `analysis/`、`templates/`、`snippets/`、`checklist/`、`notation.md`、`AGENTS.md`、`.claude/skills/`、`drills/` 均需提交到 git
- 建模/数据处理代码统一用 Python 3，依赖限定在 pip 可直接安装的库：numpy、pandas、scipy、networkx、statsmodels、python-docx、pytest
- 论文排版默认 **LaTeX**（`pdflatex` 能编译通过是验收标准之一），Word 模板为备选
- 三人共用符号表统一写在 `notation.md`：目标函数用 `Z`，决策变量用 `x_i`
- 每个代码脚手架必须配一份"什么时候用/参数怎么调/结果怎么解读/常见坑"说明，不能只有代码没有使用说明
- 涉及"AI 起草定量结论"的产出物（正文起草指引、建模方案提示词模板）必须引用 `checklist/manual_verification.md` 这道人工核对关卡
- 语料收集优先用 `WebFetch`/`WebSearch` 完成；某个来源确认无法通过这两个工具访问时，在 manifest 里注明原因并跳过，不阻塞任务

---

## File Structure

```
cumcm-toolkit/
├── .gitignore
├── notation.md
├── AGENTS.md
├── corpus/
│   ├── .gitkeep
│   └── manifest.md
├── analysis/
│   ├── paper-structure.md
│   ├── writing-style-guide.md
│   └── judge-deductions.md
├── templates/
│   ├── paper.tex
│   ├── build_word_template.py
│   └── model-proposal-prompt.md
├── snippets/
│   ├── regression/{model.py, README.md}
│   ├── ahp/{model.py, README.md}
│   ├── grey_prediction/{model.py, README.md}
│   ├── time_series/{model.py, README.md}
│   ├── graph_shortest_path/{model.py, README.md}
│   ├── linear_programming/{model.py, README.md}
│   ├── monte_carlo/{model.py, README.md}
│   └── topsis_entropy/{model.py, README.md}
├── checklist/
│   ├── compliance_check.py
│   └── manual_verification.md
├── .claude/skills/cumcm-toolkit/SKILL.md
└── drills/
    ├── README.md
    └── 2026-integration-drill.md
```

---

### Task 1: 项目骨架 + notation.md 初版

**Files:**
- Create: `cumcm-toolkit/.gitignore`
- Create: `cumcm-toolkit/corpus/.gitkeep`
- Create: `cumcm-toolkit/notation.md`

**Interfaces:**
- Produces: `notation.md` 里的符号表约定（`Z` = 目标函数，`x_i` = 决策变量），后续所有 snippets/templates 任务引用这份约定

- [ ] **Step 1: 建目录骨架**

```bash
mkdir -p cumcm-toolkit/corpus cumcm-toolkit/analysis cumcm-toolkit/templates cumcm-toolkit/checklist cumcm-toolkit/drills
mkdir -p cumcm-toolkit/snippets/regression cumcm-toolkit/snippets/ahp cumcm-toolkit/snippets/grey_prediction
mkdir -p cumcm-toolkit/snippets/time_series cumcm-toolkit/snippets/graph_shortest_path cumcm-toolkit/snippets/linear_programming
mkdir -p cumcm-toolkit/snippets/monte_carlo cumcm-toolkit/snippets/topsis_entropy
mkdir -p "cumcm-toolkit/.claude/skills/cumcm-toolkit"
touch cumcm-toolkit/corpus/.gitkeep
```

- [ ] **Step 2: 写 .gitignore**

```
corpus/*
!corpus/.gitkeep
!corpus/manifest.md
*.aux
*.log
*.out
__pycache__/
*.pyc
```

Write to `cumcm-toolkit/.gitignore`.

- [ ] **Step 3: 写 notation.md 初版**

```markdown
# 符号表 / 命名规范

三人合稿前必读，遇到规范里没覆盖的新符号，先在这里加一行再用。

## 通用约定

| 用途 | 符号 | 说明 |
|---|---|---|
| 目标函数 | `Z` | 多目标时用 `Z_1, Z_2, ...` |
| 决策变量 | `x_i` | 向量用 `\mathbf{x}`，分量下标从 1 开始 |
| 约束条件 | `g_i(\mathbf{x}) \le 0` / `h_j(\mathbf{x}) = 0` | 不等式约束用 `g`，等式约束用 `h` |
| 参数（已知量） | 希腊字母（`\alpha, \beta, \lambda, \theta` ...) | 和决策变量区分开，参数不参与求解 |
| 集合 | 花体大写（`\mathcal{S}, \mathcal{N}` ...) | 比如节点集 `\mathcal{N}`、边集 `\mathcal{E}` |
| 时间下标 | `t`，离散序列写 `x_t` | 不用 `x(t)` 和 `x_t` 混用 |
| 估计值/预测值 | 加帽子 `\hat{x}` | 和真实值 `x` 区分 |

## 图表规范

- 图编号：`图 1`、`图 2`（全文连续编号，不按章节重置）
- 表编号：`表 1`、`表 2`（同上）
- 公式编号：`(1)`、`(2)`，靠右对齐

## 更新记录

- 2026-07-02：初版，基于通用运筹学/数模写作惯例建立，尚未结合语料分析校准（见 `analysis/` 任务）
```

- [ ] **Step 4: 提交**

```bash
git add cumcm-toolkit/.gitignore cumcm-toolkit/corpus/.gitkeep cumcm-toolkit/notation.md
git commit -m "chore(数模国赛工具箱): 建立项目骨架和符号表初版"
```

---

### Task 2: 语料收集 —— 2002–2018 特等奖合集抽样

**Files:**
- Create: `cumcm-toolkit/corpus/2002-2018/<year>-<problem>.md`（每篇一份，抓正文文本 + 来源链接）
- Create: `cumcm-toolkit/corpus/2002-2018/_fetch-log.md`

**Interfaces:**
- Consumes: 无（本任务是数据源头）
- Produces: `corpus/2002-2018/` 下的抽样论文文本，供 Task 4 的 manifest 汇总、Task 5-7 的分析任务读取

- [ ] **Step 1: 定位合集入口**

用 `WebFetch` 访问 `https://github.com/zhanwen/MathModel` 和设计文档里提到的 GitHub/CSDN 2002–2018 特等奖合集页面，找到实际文件列表或下载链接。记录每个可用链接到 `_fetch-log.md`。

- [ ] **Step 2: 抽样抓取 15 篇**

年份尽量分散（2002、2005、2008、2010、2012、2014、2015、2016、2017、2018 各至少 1 篇，题型覆盖连续型/离散型/评价类/预测类）。每篇用 `WebFetch` 拉取正文，另存为 `corpus/2002-2018/<year>-<题号>.md`，文件开头加 YAML 元信息：

```markdown
---
year: 2008
problem: A
award: 特等奖
source_url: <实际链接>
fetched_at: 2026-07-02
---

<正文内容>
```

- [ ] **Step 3: 记录抓取失败项**

无法通过 `WebFetch` 访问的链接，在 `_fetch-log.md` 里记一行：`- [失败] <链接> —— <原因，比如需要登录/403/非文本 PDF>`，不阻塞后续步骤。

- [ ] **Step 4: 提交**

```bash
git add cumcm-toolkit/corpus/2002-2018
git commit -m "docs(数模国赛工具箱): 抽样收集 2002-2018 特等奖语料"
```

---

### Task 3: 语料收集 —— 2022–2025 官网展示区抽样

**Files:**
- Create: `cumcm-toolkit/corpus/2022-2025/<year>-<problem>.md`
- Create: `cumcm-toolkit/corpus/2022-2025/_fetch-log.md`

**Interfaces:**
- Consumes: 无
- Produces: `corpus/2022-2025/` 下的近几届论文文本，供 Task 4/5/6/7 使用；按设计文档"近几届加权多收"的原则，这批数量应多于 Task 2

- [ ] **Step 1: 逐年定位展示页**

用 `WebFetch` 依次访问：
- `https://dxs.moe.gov.cn/zx/hd/sxjm/sxjmlw/2022qgdxssxjmjslwzs/`
- `https://dxs.moe.gov.cn/zx/hd/sxjm/sxjmlw/2023qgdxssxjmjslwzs/`
- `https://dxs.moe.gov.cn/zx/hd/sxjm/sxjmlw/2024qgdxssxjmjslwzs/`
- `https://dxs.moe.gov.cn/zx/hd/sxjm/sxjmlw/2025qgdxssxjmjslwzs/`

每页找到 A/B/C/D/E 各题的论文详情链接列表。

- [ ] **Step 2: 抽样抓取 20 篇**

2023–2025 每年每题（A-E）至少抓 1 篇，2022 年抓 3-5 篇作为对照，总计约 20 篇。文件格式同 Task 2 的 YAML 元信息约定（`award` 字段按页面实际标注填，如"国家一等奖"）。

- [ ] **Step 3: 补 2019–2021 年（设计文档标注为"覆盖度待核实"）**

`dxs.moe.gov.cn` 是否有 2019-2021 年的独立展示页需要现场确认（URL 规律参照 2022 年是 `2022qgdxssxjmjslwzs`，按同规律试 `2019qgdxssxjmjslwzs`/`2020qgdxssxjmjslwzs`/`2021qgdxssxjmjslwzs`）。能访问到就按 Step 2 的方式抓，存入 `corpus/2019-2021/`；访问不到就用 `WebSearch` 搜"`<年份> 数学建模国赛 一等奖 论文`"找 CSDN/知乎等公开转载，每年尽量抓 2-3 篇。这三年数量目标不强求和 2022-2025 持平，抓不满也不阻塞——但要在 `_fetch-log.md` 里如实记录"实际拿到几篇/原本想拿几篇"。

- [ ] **Step 4: 记录抓取失败项**

同 Task 2 Step 3，写入 `corpus/2022-2025/_fetch-log.md`（含 Step 3 的 2019-2021 部分）。

- [ ] **Step 5: 提交**

```bash
git add cumcm-toolkit/corpus/2022-2025 cumcm-toolkit/corpus/2019-2021
git commit -m "docs(数模国赛工具箱): 抽样收集 2019-2025 语料（2022-2025 为主，2019-2021 补充）"
```

---

### Task 4: 语料清单与校验脚本

**Files:**
- Create: `cumcm-toolkit/corpus/manifest.md`
- Create: `cumcm-toolkit/checklist/tests/test_check_corpus.py`
- Create: `cumcm-toolkit/checklist/check_corpus.py`

**Interfaces:**
- Consumes: `corpus/2002-2018/*.md`、`corpus/2019-2021/*.md`、`corpus/2022-2025/*.md`（Task 2、3 产出，文件名格式 `<year>-<problem>.md`，含 YAML 头 `year`/`problem`/`award`/`source_url`）
- Produces: `check_corpus.py` 提供函数 `scan_corpus(corpus_dir: str) -> list[dict]`，返回每篇论文的 `{year, problem, award, source_url, path}`；后续任何要枚举语料的脚本都调用这个函数，不再各自解析 YAML

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/checklist/tests/test_check_corpus.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from check_corpus import scan_corpus


def test_scan_corpus_reads_yaml_front_matter(tmp_path):
    paper = tmp_path / "2020-A.md"
    paper.write_text(
        "---\nyear: 2020\nproblem: A\naward: 国家一等奖\n"
        "source_url: https://example.com\n---\n\n正文\n",
        encoding="utf-8",
    )
    result = scan_corpus(str(tmp_path))
    assert len(result) == 1
    assert result[0]["year"] == 2020
    assert result[0]["problem"] == "A"
    assert result[0]["award"] == "国家一等奖"


def test_scan_corpus_skips_non_markdown(tmp_path):
    (tmp_path / "_fetch-log.md").write_text("---\nyear: x\n---\n", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("ignore me", encoding="utf-8")
    result = scan_corpus(str(tmp_path))
    assert result == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit && python -m pytest checklist/tests/test_check_corpus.py -v`
Expected: FAIL，报 `ModuleNotFoundError: No module named 'check_corpus'`

- [ ] **Step 3: 实现 check_corpus.py**

```python
# cumcm-toolkit/checklist/check_corpus.py
import re
from pathlib import Path

_FRONT_MATTER = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
_SKIP_NAMES = {"manifest.md", "_fetch-log.md"}


def _parse_front_matter(text: str) -> dict:
    match = _FRONT_MATTER.match(text)
    if not match:
        return {}
    fields = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()
    if "year" in fields:
        try:
            fields["year"] = int(fields["year"])
        except ValueError:
            pass
    return fields


def scan_corpus(corpus_dir: str) -> list[dict]:
    results = []
    for path in sorted(Path(corpus_dir).rglob("*.md")):
        if path.name in _SKIP_NAMES:
            continue
        fields = _parse_front_matter(path.read_text(encoding="utf-8"))
        if not fields:
            continue
        fields["path"] = str(path)
        results.append(fields)
    return results


if __name__ == "__main__":
    import sys

    entries = scan_corpus(sys.argv[1] if len(sys.argv) > 1 else "corpus")
    print(f"共 {len(entries)} 篇")
    for e in entries:
        print(f"  {e.get('year')} {e.get('problem')} {e.get('award')} -> {e['path']}")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit && python -m pytest checklist/tests/test_check_corpus.py -v`
Expected: PASS（2 passed）

- [ ] **Step 5: 生成 manifest.md**

```bash
cd cumcm-toolkit
python checklist/check_corpus.py corpus > /tmp/corpus-scan.txt
cat /tmp/corpus-scan.txt
```

把输出整理成 `corpus/manifest.md`，表头：`年份 | 题号 | 奖项 | 来源 | 本地路径`，文末加一行"最后更新：2026-07-02，共 N 篇；覆盖年份 2002-2018 抽样 15 篇、2019-2021 补充若干篇（数量以实际抓取结果为准）、2022-2025 抽样 20 篇"。

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/corpus/manifest.md cumcm-toolkit/checklist/check_corpus.py cumcm-toolkit/checklist/tests/test_check_corpus.py
git commit -m "feat(数模国赛工具箱): 语料清单生成脚本 + manifest"
```

---

### Task 5: 论文骨架结构分析

**Files:**
- Create: `cumcm-toolkit/analysis/paper-structure.md`

**Interfaces:**
- Consumes: `corpus/2002-2018/*.md`、`corpus/2022-2025/*.md`（通读语料，非程序化处理）
- Produces: 论文骨架模板，供 Task 8（LaTeX 模板）、Task 9（Word 模板）、Task 20（建模方案提示词模板）引用章节结构

- [ ] **Step 1: 通读语料，标注每篇的章节结构和篇幅占比**

对 Task 2/3 收集到的论文，逐篇记录：有哪些一级章节、每节大致占全文篇幅的百分比、摘要长度（字数）。

- [ ] **Step 2: 写 analysis/paper-structure.md**

```markdown
# 论文骨架结构分析

基于 corpus/ 下 N 篇金奖论文（2002-2025）的共性归纳。

## 标准骨架（按出现顺序）

| 章节 | 篇幅占比（经验值） | 要点 |
|---|---|---|
| 摘要 | 3-5% | 一段话说清问题、方法、关键结果、亮点；不写"本文首先...然后..."式流水账 |
| 问题重述 | 5-8% | 复述题目背景+明确要解决的子问题列表，不照抄题干 |
| 问题分析 | 5-10% | 说清每个子问题的建模思路，承上启下 |
| 模型假设 | 3-5% | 每条假设要能追溯到后面某个模型简化的理由，不是泛泛而谈 |
| 符号说明 | 2-3% | 表格形式，全文出现的符号都要在这里 |
| 模型的建立与求解 | 40-50% | 全文主体，每个子问题一个小节：建模 -> 求解 -> 结果 |
| 灵敏度分析 | 5-8% | 不能只做一个参数扫一下就完事，要说明为什么选这个参数、结果说明了什么 |
| 模型评价（优缺点）与推广 | 3-5% | 诚实写局限，不是自吹自擂 |
| 参考文献 | - | 按国标 GB/T 7714 格式 |
| 附录（代码/数据） | - | 不占正文篇幅 |

## 更新记录

- 2026-07-02：基于首批 N 篇语料的初版分析，后续每次补充语料后回来修订这份文档
```

- [ ] **Step 3: 提交**

```bash
git add cumcm-toolkit/analysis/paper-structure.md
git commit -m "docs(数模国赛工具箱): 论文骨架结构分析"
```

---

### Task 6: 写作规范清单

**Files:**
- Create: `cumcm-toolkit/analysis/writing-style-guide.md`

**Interfaces:**
- Consumes: 同 Task 5 的语料
- Produces: 写作规范，供 Task 18（`compliance_check.py`）把其中可程序化检查的规则转成自动检查项

- [ ] **Step 1: 归纳写作规范**

- [ ] **Step 2: 写 analysis/writing-style-guide.md**

```markdown
# 写作规范清单

## 时态人称

- 全文第三人称，不用"我们认为"，改用"本文认为"/"建立的模型表明"
- 描述已完成的求解过程用一般过去时口吻的中文表达（"求解得到"而非"将会求解得到"）

## 图表规范

- 每张图/表必须在正文中被引用（"如图 3 所示"），不能孤立插入
- 图题在图下方，表题在表上方
- 图表编号全文连续，不按章节重置（对应 notation.md 里的约定）

## 公式规范

- 公式单独成行并居中，编号靠右
- 正文中引用公式用"由式 (3) 可得"，不用"上面的公式"

## 参考文献

- 按 GB/T 7714 格式；引用至少 5 条，且要有近 3 年内的文献（不能全是教材）

## 常见语言问题（从语料里观察到、要避免的）

- 摘要写成"本文首先...然后...最后..."的流水账体，没有信息量
- 大量使用"显然""易知"，缺少推导过程
- 结果分析部分只贴图不解读，图后面没有一句话说明这张图证明了什么

## 更新记录

- 2026-07-02：初版
```

- [ ] **Step 3: 提交**

```bash
git add cumcm-toolkit/analysis/writing-style-guide.md
git commit -m "docs(数模国赛工具箱): 写作规范清单"
```

---

### Task 7: 评委扣分点清单

**Files:**
- Create: `cumcm-toolkit/analysis/judge-deductions.md`

**Interfaces:**
- Consumes: 同 Task 5 的语料，重点看那些"结构完整但明显有短板"的论文
- Produces: 扣分点清单，供 Task 19（`manual_verification.md`）和 Task 20（建模方案提示词）引用

- [ ] **Step 1: 归纳共性问题**

- [ ] **Step 2: 写 analysis/judge-deductions.md**

```markdown
# 评委扣分点清单

从语料共性问题反推，赛时论文手/整合者交稿前应逐条自查。

- [ ] 假设部分和后面的模型是否对得上？（常见问题：假设写了 5 条，模型里只用到 2 条，或者模型用到的简化没有对应假设）
- [ ] 灵敏度分析是否只是"调一个参数画个图"？有没有说明为什么选这个参数、结果说明了什么、对结论有什么影响？
- [ ] 模型评价部分是否诚实指出了局限？（一眼假大空的自夸是减分项）
- [ ] 摘要是否能让人不看正文就明白"做了什么、怎么做的、结果如何"？
- [ ] 每个子问题的答案是否都能在正文里直接定位到（不需要读者自己去拼凑）？
- [ ] 数据来源是否交代清楚（爬的/题目给的/自己假设的），假设的数据是否有依据？
- [ ] 代码是否放进附录而不是占正文篇幅？
- [ ] 参考文献格式是否统一、是否全是教材没有近年文献？

## 更新记录

- 2026-07-02：初版
```

- [ ] **Step 3: 提交**

```bash
git add cumcm-toolkit/analysis/judge-deductions.md
git commit -m "docs(数模国赛工具箱): 评委扣分点清单"
```

---

### Task 8: LaTeX 主模板

**Files:**
- Create: `cumcm-toolkit/templates/paper.tex`

**Interfaces:**
- Consumes: `analysis/paper-structure.md` 的章节骨架、`notation.md` 的图表/公式编号约定
- Produces: 可编译的 `.tex` 骨架，章节标题和 `analysis/paper-structure.md` 一一对应，供赛时直接复制使用

- [ ] **Step 1: 写模板**

```latex
% cumcm-toolkit/templates/paper.tex
\documentclass[12pt]{article}
\usepackage{ctex}
\usepackage{amsmath, amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage[colorlinks=true, linkcolor=black]{hyperref}
\usepackage{geometry}
\geometry{a4paper, margin=2.5cm}

\title{论文标题}
\author{}
\date{}

\begin{document}
\maketitle

\begin{abstract}
摘要正文。一段话说清问题、方法、关键结果、亮点。
\end{abstract}

\section{问题重述}

\section{问题分析}

\section{模型假设}

\begin{enumerate}
  \item 假设一
\end{enumerate}

\section{符号说明}

\begin{table}[htbp]
  \centering
  \caption{符号说明}
  \begin{tabular}{cl}
    \toprule
    符号 & 含义 \\
    \midrule
    $Z$ & 目标函数 \\
    $x_i$ & 决策变量 \\
    \bottomrule
  \end{tabular}
\end{table}

\section{模型的建立与求解}

\subsection{问题一}

\section{灵敏度分析}

\section{模型评价与推广}

\subsection{模型的优点}

\subsection{模型的缺点}

\begin{thebibliography}{9}
\bibitem{ref1} 作者. 文献标题[J]. 期刊名, 年份.
\end{thebibliography}

\appendix
\section{程序代码}

\end{document}
```

- [ ] **Step 2: 验证能编译**

Run: `cd cumcm-toolkit/templates && pdflatex -interaction=nonstopmode paper.tex`
Expected: 命令结束输出 `Output written on paper.pdf`，退出码 0；清理产物 `rm -f paper.aux paper.log paper.out paper.pdf`

- [ ] **Step 3: 提交**

```bash
git add cumcm-toolkit/templates/paper.tex
git commit -m "feat(数模国赛工具箱): LaTeX 主模板"
```

---

### Task 9: Word 模板（备选）

**Files:**
- Create: `cumcm-toolkit/templates/build_word_template.py`
- Create: `cumcm-toolkit/templates/tests/test_build_word_template.py`

**Interfaces:**
- Consumes: `analysis/paper-structure.md` 的章节骨架
- Produces: 运行 `build_word_template.py` 生成 `templates/paper_template.docx`（不进 git 的构建产物？—— 不，这个是模板本身要复用，`.docx` 需要提交，见 Step 4）

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/templates/tests/test_build_word_template.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_word_template import build_template

EXPECTED_HEADINGS = [
    "摘要", "问题重述", "问题分析", "模型假设", "符号说明",
    "模型的建立与求解", "灵敏度分析", "模型评价与推广", "参考文献",
]


def test_build_template_creates_all_headings(tmp_path):
    out = tmp_path / "paper_template.docx"
    build_template(str(out))
    from docx import Document

    doc = Document(str(out))
    headings = [p.text for p in doc.paragraphs if p.style.name.startswith("Heading")]
    for expected in EXPECTED_HEADINGS:
        assert expected in headings
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit && python -m pytest templates/tests/test_build_word_template.py -v`
Expected: FAIL，`ModuleNotFoundError: No module named 'build_word_template'`

- [ ] **Step 3: 实现 build_word_template.py**

```python
# cumcm-toolkit/templates/build_word_template.py
from docx import Document

_HEADINGS = [
    "摘要", "问题重述", "问题分析", "模型假设", "符号说明",
    "模型的建立与求解", "灵敏度分析", "模型评价与推广", "参考文献",
]


def build_template(out_path: str) -> None:
    doc = Document()
    doc.add_heading("论文标题", level=0)
    for heading in _HEADINGS:
        doc.add_heading(heading, level=1)
        doc.add_paragraph("（占位段落，赛时替换为正文）")
    doc.save(out_path)


if __name__ == "__main__":
    import sys

    build_template(sys.argv[1] if len(sys.argv) > 1 else "paper_template.docx")
```

- [ ] **Step 4: 跑测试确认通过，生成模板文件**

Run: `cd cumcm-toolkit && python -m pytest templates/tests/test_build_word_template.py -v`
Expected: PASS

Run: `cd cumcm-toolkit/templates && python build_word_template.py paper_template.docx`
Expected: 生成 `templates/paper_template.docx`

- [ ] **Step 5: 提交**

```bash
git add cumcm-toolkit/templates/build_word_template.py cumcm-toolkit/templates/tests/test_build_word_template.py cumcm-toolkit/templates/paper_template.docx
git commit -m "feat(数模国赛工具箱): Word 备选模板生成脚本"
```

---

### Task 10: 代码脚手架 —— 回归/拟合

**Files:**
- Create: `cumcm-toolkit/snippets/regression/model.py`
- Create: `cumcm-toolkit/snippets/regression/README.md`
- Create: `cumcm-toolkit/snippets/regression/test_model.py`

**Interfaces:**
- Produces: `fit_linear(x: np.ndarray, y: np.ndarray) -> dict`，返回 `{"coef": float, "intercept": float, "r2": float}`

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/snippets/regression/test_model.py
import numpy as np
from model import fit_linear


def test_fit_linear_recovers_known_line():
    x = np.array([0, 1, 2, 3, 4], dtype=float)
    y = 2 * x + 1
    result = fit_linear(x, y)
    assert abs(result["coef"] - 2.0) < 1e-9
    assert abs(result["intercept"] - 1.0) < 1e-9
    assert result["r2"] > 0.999
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit/snippets/regression && python -m pytest test_model.py -v`
Expected: FAIL，`ModuleNotFoundError: No module named 'model'`

- [ ] **Step 3: 实现 model.py**

```python
# cumcm-toolkit/snippets/regression/model.py
import numpy as np


def fit_linear(x: np.ndarray, y: np.ndarray) -> dict:
    coef, intercept = np.polyfit(x, y, 1)
    y_pred = coef * x + intercept
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return {"coef": float(coef), "intercept": float(intercept), "r2": float(r2)}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit/snippets/regression && python -m pytest test_model.py -v`
Expected: PASS

- [ ] **Step 5: 写 README.md**

```markdown
# 回归/拟合

**什么时候用**：变量之间有明显的线性/近似线性趋势，需要量化关系或做外推预测。

**参数怎么调**：`np.polyfit(x, y, degree)` 的 `degree` 从 1 开始试，画残差图看是否还有明显趋势，趋势消失再加阶数；阶数超过 3 通常是过拟合信号。

**结果怎么解读**：`r2` 越接近 1 拟合越好，但 `r2` 高不代表外推可靠——线性回归外推要在正文里说明外推范围和风险。

**常见坑**：
- 数据点太少（<10）时 `r2` 会虚高，不能只看 `r2` 下结论
- 变量间不是线性关系时强行线性拟合，要先看散点图
```

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/snippets/regression
git commit -m "feat(数模国赛工具箱): 回归/拟合代码脚手架"
```

---

### Task 11: 代码脚手架 —— 层次分析法（AHP）

**Files:**
- Create: `cumcm-toolkit/snippets/ahp/model.py`
- Create: `cumcm-toolkit/snippets/ahp/README.md`
- Create: `cumcm-toolkit/snippets/ahp/test_model.py`

**Interfaces:**
- Produces: `ahp_weights(matrix: np.ndarray) -> dict`，返回 `{"weights": np.ndarray, "cr": float, "consistent": bool}`

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/snippets/ahp/test_model.py
import numpy as np
from model import ahp_weights


def test_ahp_weights_on_consistent_matrix():
    # 3 个方案，两两比较矩阵完全一致（A 比 B 重 2 倍，B 比 C 重 2 倍，A 比 C 重 4 倍）
    matrix = np.array([
        [1, 2, 4],
        [1 / 2, 1, 2],
        [1 / 4, 1 / 2, 1],
    ])
    result = ahp_weights(matrix)
    assert result["consistent"] is True
    assert abs(sum(result["weights"]) - 1.0) < 1e-9
    assert result["weights"][0] > result["weights"][1] > result["weights"][2]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit/snippets/ahp && python -m pytest test_model.py -v`
Expected: FAIL，`ModuleNotFoundError`

- [ ] **Step 3: 实现 model.py**

```python
# cumcm-toolkit/snippets/ahp/model.py
import numpy as np

_RANDOM_INDEX = {1: 0, 2: 0, 3: 0.58, 4: 0.9, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}


def ahp_weights(matrix: np.ndarray) -> dict:
    n = matrix.shape[0]
    eigvals, eigvecs = np.linalg.eig(matrix)
    max_idx = int(np.argmax(eigvals.real))
    lambda_max = eigvals[max_idx].real
    weights = eigvecs[:, max_idx].real
    weights = weights / weights.sum()

    ci = (lambda_max - n) / (n - 1) if n > 1 else 0.0
    ri = _RANDOM_INDEX.get(n, 1.49)
    cr = ci / ri if ri > 0 else 0.0

    return {"weights": weights, "cr": float(cr), "consistent": cr < 0.1}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit/snippets/ahp && python -m pytest test_model.py -v`
Expected: PASS

- [ ] **Step 5: 写 README.md**

```markdown
# 层次分析法（AHP）

**什么时候用**：多个评价指标/方案需要打分排序，指标之间重要性能靠专家/团队主观两两比较给出。

**参数怎么调**：矩阵是唯一输入，来自团队对指标重要性的两两比较打分（1-9 标度）；没有"调参"，调的是打分本身——打分要在正文里说明依据，不能凭空定。

**结果怎么解读**：`weights` 是各指标权重（和为 1）；`cr < 0.1` 才说明打分矩阵逻辑自洽，可以用；`cr >= 0.1` 必须回去调整打分重新算。

**常见坑**：
- `cr >= 0.1` 还硬用结果——评委会直接扣分，务必检查 `consistent` 字段
- 指标超过 9 个时一次性两两比较容易失去逻辑一致性，考虑先分组再层次化
```

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/snippets/ahp
git commit -m "feat(数模国赛工具箱): AHP 代码脚手架"
```

---

### Task 12: 代码脚手架 —— 灰色预测 GM(1,1)

**Files:**
- Create: `cumcm-toolkit/snippets/grey_prediction/model.py`
- Create: `cumcm-toolkit/snippets/grey_prediction/README.md`
- Create: `cumcm-toolkit/snippets/grey_prediction/test_model.py`

**Interfaces:**
- Produces: `gm11_forecast(series: np.ndarray, steps: int) -> dict`，返回 `{"forecast": np.ndarray, "a": float, "b": float}`

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/snippets/grey_prediction/test_model.py
import numpy as np
from model import gm11_forecast


def test_gm11_forecast_reproduces_training_length_and_extends():
    series = np.array([100, 105, 112, 120, 130], dtype=float)
    result = gm11_forecast(series, steps=2)
    assert len(result["forecast"]) == len(series) + 2
    # 拟合值应该接近原始序列前几个点（GM(1,1) 对平稳增长序列拟合较好）
    assert abs(result["forecast"][1] - series[1]) / series[1] < 0.1
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit/snippets/grey_prediction && python -m pytest test_model.py -v`
Expected: FAIL，`ModuleNotFoundError`

- [ ] **Step 3: 实现 model.py**

```python
# cumcm-toolkit/snippets/grey_prediction/model.py
import numpy as np


def gm11_forecast(series: np.ndarray, steps: int) -> dict:
    x0 = np.asarray(series, dtype=float)
    n = len(x0)
    x1 = np.cumsum(x0)
    z1 = 0.5 * (x1[1:] + x1[:-1])

    B = np.column_stack([-z1, np.ones(n - 1)])
    Y = x0[1:]
    a, b = np.linalg.lstsq(B, Y, rcond=None)[0]

    def x1_hat(k):
        return (x0[0] - b / a) * np.exp(-a * k) + b / a

    total = n + steps
    x1_pred = np.array([x1_hat(k) for k in range(total)])
    x0_pred = np.empty(total)
    x0_pred[0] = x0[0]
    x0_pred[1:] = np.diff(x1_pred)

    return {"forecast": x0_pred, "a": float(a), "b": float(b)}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit/snippets/grey_prediction && python -m pytest test_model.py -v`
Expected: PASS

- [ ] **Step 5: 写 README.md**

```markdown
# 灰色预测 GM(1,1)

**什么时候用**：样本量少（一般 4-10 个数据点）、呈近似指数增长/衰减趋势的时间序列，数据点太少不适合用 ARIMA。

**参数怎么调**：没有超参数需要调，输入就是原始序列；`steps` 是往后预测几期。

**结果怎么解读**：`a` 是发展系数，`abs(a) > 2` 时模型不适用（级比超出可行域），要在正文里做级比检验，不能直接跳过。

**常见坑**：
- 数据点少于 4 个或波动很大（不是近似指数趋势）时强行用 GM(1,1)，预测会很离谱
- 不做级比检验就直接报预测结果——这是灵敏度分析/模型检验部分该做的事，见 `analysis/judge-deductions.md`
```

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/snippets/grey_prediction
git commit -m "feat(数模国赛工具箱): 灰色预测 GM(1,1) 代码脚手架"
```

---

### Task 13: 代码脚手架 —— 时间序列（ARIMA）

**Files:**
- Create: `cumcm-toolkit/snippets/time_series/model.py`
- Create: `cumcm-toolkit/snippets/time_series/README.md`
- Create: `cumcm-toolkit/snippets/time_series/test_model.py`

**Interfaces:**
- Produces: `arima_forecast(series: np.ndarray, order: tuple, steps: int) -> dict`，返回 `{"forecast": np.ndarray, "aic": float}`

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/snippets/time_series/test_model.py
import numpy as np
from model import arima_forecast


def test_arima_forecast_returns_requested_steps():
    rng = np.random.default_rng(0)
    series = np.cumsum(rng.normal(0, 1, size=50)) + 100
    result = arima_forecast(series, order=(1, 1, 0), steps=5)
    assert len(result["forecast"]) == 5
    assert isinstance(result["aic"], float)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit/snippets/time_series && python -m pytest test_model.py -v`
Expected: FAIL，`ModuleNotFoundError`

- [ ] **Step 3: 实现 model.py**

```python
# cumcm-toolkit/snippets/time_series/model.py
import numpy as np
from statsmodels.tsa.arima.model import ARIMA


def arima_forecast(series: np.ndarray, order: tuple, steps: int) -> dict:
    fitted = ARIMA(np.asarray(series, dtype=float), order=order).fit()
    forecast = fitted.forecast(steps=steps)
    return {"forecast": np.asarray(forecast), "aic": float(fitted.aic)}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit/snippets/time_series && python -m pytest test_model.py -v`
Expected: PASS

- [ ] **Step 5: 写 README.md**

```markdown
# 时间序列（ARIMA）

**什么时候用**：数据点较多（一般 >= 30 个）、有明显的自相关结构，且不是简单的指数增长趋势。

**参数怎么调**：`order=(p, d, q)`——`d` 看几阶差分后序列平稳（可以用 `statsmodels` 的 ADF 检验，或者简单画图看趋势是否消除）；`p`、`q` 用 ACF/PACF 图或者用 `aic` 网格搜索几组取最小的。

**结果怎么解读**：`aic` 越小模型相对越好，但只能在同一份数据上比较不同 `order` 的 `aic`，不能跨数据集比较。

**常见坑**：
- 数据点太少（<20）硬套 ARIMA，参数估计不稳定
- 不做平稳性检验直接设 `d=0`
```

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/snippets/time_series
git commit -m "feat(数模国赛工具箱): 时间序列 ARIMA 代码脚手架"
```

---

### Task 14: 代码脚手架 —— 图论最短路

**Files:**
- Create: `cumcm-toolkit/snippets/graph_shortest_path/model.py`
- Create: `cumcm-toolkit/snippets/graph_shortest_path/README.md`
- Create: `cumcm-toolkit/snippets/graph_shortest_path/test_model.py`

**Interfaces:**
- Produces: `shortest_path(edges: list[tuple], source, target) -> dict`，`edges` 元素为 `(u, v, weight)`，返回 `{"path": list, "length": float}`

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/snippets/graph_shortest_path/test_model.py
from model import shortest_path


def test_shortest_path_on_simple_graph():
    edges = [("A", "B", 1), ("B", "C", 1), ("A", "C", 5)]
    result = shortest_path(edges, "A", "C")
    assert result["path"] == ["A", "B", "C"]
    assert result["length"] == 2
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit/snippets/graph_shortest_path && python -m pytest test_model.py -v`
Expected: FAIL，`ModuleNotFoundError`

- [ ] **Step 3: 实现 model.py**

```python
# cumcm-toolkit/snippets/graph_shortest_path/model.py
import networkx as nx


def shortest_path(edges: list, source, target) -> dict:
    graph = nx.Graph()
    graph.add_weighted_edges_from(edges)
    path = nx.shortest_path(graph, source, target, weight="weight")
    length = nx.shortest_path_length(graph, source, target, weight="weight")
    return {"path": path, "length": length}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit/snippets/graph_shortest_path && python -m pytest test_model.py -v`
Expected: PASS

- [ ] **Step 5: 写 README.md**

```markdown
# 图论最短路 / 网络流

**什么时候用**：题目本质是"节点+边"的网络结构，问最短路径/最小成本/最大流量（比如路网、物流、通信网络）。

**参数怎么调**：核心输入是 `edges` 的权重定义——权重可以是距离、时间、成本，取决于题目问的是什么，权重定义错了结果没有意义。

**结果怎么解读**：`length` 是路径总权重，不是"跳数"；如果题目要的是网络流（比如最大流量），要换用 `networkx.maximum_flow` 而不是这个最短路函数。

**常见坑**：
- 有向图用 `nx.Graph()`（无向）建图——方向错了结果就是错的，有向场景要用 `nx.DiGraph()`
- 权重为负时 Dijkstra（`networkx` 默认算法）不适用，要用 Bellman-Ford
```

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/snippets/graph_shortest_path
git commit -m "feat(数模国赛工具箱): 图论最短路代码脚手架"
```

---

### Task 15: 代码脚手架 —— 线性规划

**Files:**
- Create: `cumcm-toolkit/snippets/linear_programming/model.py`
- Create: `cumcm-toolkit/snippets/linear_programming/README.md`
- Create: `cumcm-toolkit/snippets/linear_programming/test_model.py`

**Interfaces:**
- Produces: `solve_lp(c, A_ub, b_ub, bounds) -> dict`，返回 `{"x": np.ndarray, "objective": float, "success": bool}`（最小化 `c @ x`）

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/snippets/linear_programming/test_model.py
from model import solve_lp


def test_solve_lp_known_optimum():
    # 最小化 -x - 2y （即最大化 x + 2y），约束 x + y <= 4, x <= 3, x,y >= 0
    result = solve_lp(
        c=[-1, -2],
        A_ub=[[1, 1], [1, 0]],
        b_ub=[4, 3],
        bounds=[(0, None), (0, None)],
    )
    assert result["success"] is True
    assert abs(result["objective"] - (-8)) < 1e-6
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit/snippets/linear_programming && python -m pytest test_model.py -v`
Expected: FAIL，`ModuleNotFoundError`

- [ ] **Step 3: 实现 model.py**

```python
# cumcm-toolkit/snippets/linear_programming/model.py
from scipy.optimize import linprog


def solve_lp(c, A_ub, b_ub, bounds) -> dict:
    result = linprog(c=c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")
    return {"x": result.x, "objective": float(result.fun), "success": bool(result.success)}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit/snippets/linear_programming && python -m pytest test_model.py -v`
Expected: PASS

- [ ] **Step 5: 写 README.md**

```markdown
# 线性/非线性规划

**什么时候用**：有明确的目标函数（对应 `notation.md` 里的 `Z`）和线性约束，求最优解（资源分配、排班、生产计划类问题）。

**参数怎么调**：`scipy.optimize.linprog` 默认求**最小化**，要最大化就把 `c` 取负号（见测试里的例子）；非线性问题改用 `scipy.optimize.minimize`，接口不同，不能直接套这份脚手架。

**结果怎么解读**：`success=False` 说明无可行解或求解失败，不能直接报告 `x`——这时候要检查约束是否写错、是否真的无解。

**常见坑**：
- 约束方向搞反（`A_ub, b_ub` 是 `<=` 约束，等式约束要用 `A_eq, b_eq`）
- 决策变量该是整数（比如"派几辆车"）却用连续松弛结果直接四舍五入报告——这是整数规划问题，要换 `scipy.optimize.milp` 或说明近似处理方式
```

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/snippets/linear_programming
git commit -m "feat(数模国赛工具箱): 线性规划代码脚手架"
```

---

### Task 16: 代码脚手架 —— 蒙特卡洛仿真

**Files:**
- Create: `cumcm-toolkit/snippets/monte_carlo/model.py`
- Create: `cumcm-toolkit/snippets/monte_carlo/README.md`
- Create: `cumcm-toolkit/snippets/monte_carlo/test_model.py`

**Interfaces:**
- Produces: `estimate_by_sampling(sampler: callable, n_trials: int, seed: int) -> dict`，返回 `{"mean": float, "std": float}`

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/snippets/monte_carlo/test_model.py
from model import estimate_by_sampling


def test_estimate_by_sampling_converges_on_known_distribution():
    import numpy as np

    def sampler(rng):
        return rng.normal(loc=5.0, scale=1.0)

    result = estimate_by_sampling(sampler, n_trials=20000, seed=0)
    assert abs(result["mean"] - 5.0) < 0.1
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit/snippets/monte_carlo && python -m pytest test_model.py -v`
Expected: FAIL，`ModuleNotFoundError`

- [ ] **Step 3: 实现 model.py**

```python
# cumcm-toolkit/snippets/monte_carlo/model.py
import numpy as np


def estimate_by_sampling(sampler, n_trials: int, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    samples = np.array([sampler(rng) for _ in range(n_trials)])
    return {"mean": float(samples.mean()), "std": float(samples.std())}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit/snippets/monte_carlo && python -m pytest test_model.py -v`
Expected: PASS

- [ ] **Step 5: 写 README.md**

```markdown
# 蒙特卡洛仿真

**什么时候用**：问题涉及随机性/不确定性，解析求解困难或不可能（排队系统、随机过程、复杂系统的概率估计）。

**参数怎么调**：`n_trials` 越大结果越稳定，但要做收敛性检查——正文里应该画一张"随试验次数增加，估计值如何趋于稳定"的图，不是随便定一个 `n_trials` 就报告结果。`seed` 固定住保证结果可复现。

**结果怎么解读**：`std` 反映估计的波动性，配合 `n_trials` 可以算标准误 `std / sqrt(n_trials)`，正文里报告结果时应该带上这个不确定性范围，不是只报一个点估计。

**常见坑**：
- 不固定随机种子，导致每次运行结果不一样、无法复现
- `sampler` 里的随机过程假设（比如分布类型）没有依据、也没在正文里说明
```

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/snippets/monte_carlo
git commit -m "feat(数模国赛工具箱): 蒙特卡洛仿真代码脚手架"
```

---

### Task 17: 代码脚手架 —— TOPSIS / 熵权法

**Files:**
- Create: `cumcm-toolkit/snippets/topsis_entropy/model.py`
- Create: `cumcm-toolkit/snippets/topsis_entropy/README.md`
- Create: `cumcm-toolkit/snippets/topsis_entropy/test_model.py`

**Interfaces:**
- Produces: `entropy_weights(matrix: np.ndarray) -> np.ndarray`（各列权重）；`topsis_score(matrix: np.ndarray, weights: np.ndarray) -> np.ndarray`（各行综合得分，越大越优）

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/snippets/topsis_entropy/test_model.py
import numpy as np
from model import entropy_weights, topsis_score


def test_entropy_weights_sum_to_one():
    matrix = np.array([[1, 10], [2, 8], [3, 6], [4, 4]], dtype=float)
    weights = entropy_weights(matrix)
    assert abs(weights.sum() - 1.0) < 1e-9


def test_topsis_score_ranks_best_alternative_highest():
    # 两个指标都是越大越好，第 4 行 (4,4) 综合应不弱于第 1 行 (1,10) 之外的中间行
    matrix = np.array([[1, 10], [2, 8], [3, 6], [10, 10]], dtype=float)
    weights = np.array([0.5, 0.5])
    scores = topsis_score(matrix, weights)
    assert scores.argmax() == 3  # 第 4 行两个指标都最大，应该排第一
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit/snippets/topsis_entropy && python -m pytest test_model.py -v`
Expected: FAIL，`ModuleNotFoundError`

- [ ] **Step 3: 实现 model.py**

```python
# cumcm-toolkit/snippets/topsis_entropy/model.py
import numpy as np


def _normalize(matrix: np.ndarray) -> np.ndarray:
    col_sum = matrix.sum(axis=0)
    col_sum[col_sum == 0] = 1e-12
    return matrix / col_sum


def entropy_weights(matrix: np.ndarray) -> np.ndarray:
    p = _normalize(matrix)
    p_safe = np.where(p == 0, 1e-12, p)
    n = matrix.shape[0]
    k = 1.0 / np.log(n)
    entropy = -k * np.sum(p_safe * np.log(p_safe), axis=0)
    diversity = 1 - entropy
    return diversity / diversity.sum()


def topsis_score(matrix: np.ndarray, weights: np.ndarray) -> np.ndarray:
    norm = matrix / np.sqrt((matrix ** 2).sum(axis=0))
    weighted = norm * weights
    best = weighted.max(axis=0)
    worst = weighted.min(axis=0)
    dist_best = np.sqrt(((weighted - best) ** 2).sum(axis=1))
    dist_worst = np.sqrt(((weighted - worst) ** 2).sum(axis=1))
    denom = dist_best + dist_worst
    denom[denom == 0] = 1e-12
    return dist_worst / denom
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit/snippets/topsis_entropy && python -m pytest test_model.py -v`
Expected: PASS

- [ ] **Step 5: 写 README.md**

```markdown
# TOPSIS / 熵权法

**什么时候用**：评价类问题，多个方案在多个指标上打分，需要给出综合排名；熵权法用于客观确定权重（区别于 AHP 的主观打分），两者可以结合（熵权法定权重，TOPSIS 排序）。

**参数怎么调**：输入矩阵前先统一指标方向（越大越好 / 越小越好要统一处理，成本型指标先取倒数或做正向化）；没有其他超参数。

**结果怎么解读**：`topsis_score` 越接近 1 越优；权重（`entropy_weights`）反映的是"哪个指标在样本里区分度大"，不代表指标本身重要性，正文里要说明这一点，不要和 AHP 的主观权重混为一谈。

**常见坑**：
- 指标方向不统一（比如成本类指标没有取反）直接扔进去算，排名会反直觉
- 熵权法在样本量很小（比如只有 3-4 个方案）时权重会不稳定，样本少时优先用 AHP
```

- [ ] **Step 6: 提交**

```bash
git add cumcm-toolkit/snippets/topsis_entropy
git commit -m "feat(数模国赛工具箱): TOPSIS/熵权法代码脚手架"
```

---

### Task 18: 自动合规检查脚本

**Files:**
- Create: `cumcm-toolkit/checklist/compliance_check.py`
- Create: `cumcm-toolkit/checklist/tests/test_compliance_check.py`

**Interfaces:**
- Consumes: 一份 `.tex` 文件路径
- Produces: `check_tex(path: str) -> dict`，返回 `{"issues": list[str]}`；`issues` 为空表示没查出问题

- [ ] **Step 1: 写失败测试**

```python
# cumcm-toolkit/checklist/tests/test_compliance_check.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compliance_check import check_tex


def test_check_tex_flags_missing_abstract(tmp_path):
    tex = tmp_path / "paper.tex"
    tex.write_text(r"\documentclass{article}\begin{document}\section{正文}\end{document}", encoding="utf-8")
    result = check_tex(str(tex))
    assert any("abstract" in issue for issue in result["issues"])


def test_check_tex_flags_figure_without_caption(tmp_path):
    tex = tmp_path / "paper.tex"
    tex.write_text(
        r"\begin{abstract}x\end{abstract}"
        r"\begin{figure}\includegraphics{a.png}\end{figure}",
        encoding="utf-8",
    )
    result = check_tex(str(tex))
    assert any("caption" in issue for issue in result["issues"])


def test_check_tex_passes_clean_document(tmp_path):
    tex = tmp_path / "paper.tex"
    tex.write_text(
        r"\begin{abstract}x\end{abstract}"
        r"\begin{figure}\includegraphics{a.png}\caption{示意图}\end{figure}",
        encoding="utf-8",
    )
    result = check_tex(str(tex))
    assert result["issues"] == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd cumcm-toolkit && python -m pytest checklist/tests/test_compliance_check.py -v`
Expected: FAIL，`ModuleNotFoundError`

- [ ] **Step 3: 实现 compliance_check.py**

```python
# cumcm-toolkit/checklist/compliance_check.py
import re
from pathlib import Path


def check_tex(path: str) -> dict:
    text = Path(path).read_text(encoding="utf-8")
    issues = []

    if "\\begin{abstract}" not in text:
        issues.append("缺少 abstract 环境（摘要）")

    for match in re.finditer(r"\\begin\{figure\}(.*?)\\end\{figure\}", text, re.DOTALL):
        if "\\caption" not in match.group(1):
            issues.append("存在 figure 环境缺少 \\caption（图注）")

    for match in re.finditer(r"\\begin\{table\}(.*?)\\end\{table\}", text, re.DOTALL):
        if "\\caption" not in match.group(1):
            issues.append("存在 table 环境缺少 \\caption（表注）")

    return {"issues": issues}


if __name__ == "__main__":
    import sys

    result = check_tex(sys.argv[1])
    if result["issues"]:
        print("发现问题：")
        for issue in result["issues"]:
            print(f"  - {issue}")
        sys.exit(1)
    print("未发现问题")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd cumcm-toolkit && python -m pytest checklist/tests/test_compliance_check.py -v`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```bash
git add cumcm-toolkit/checklist/compliance_check.py cumcm-toolkit/checklist/tests/test_compliance_check.py
git commit -m "feat(数模国赛工具箱): 自动合规检查脚本（摘要/图表 caption）"
```

---

### Task 19: 人工核对清单（护栏）

**Files:**
- Create: `cumcm-toolkit/checklist/manual_verification.md`

**Interfaces:**
- Consumes: `analysis/judge-deductions.md`
- Produces: 人工核对清单，被 Task 20 的建模方案提示词模板和 Task 21 的 `AGENTS.md` 引用

- [ ] **Step 1: 写 checklist/manual_verification.md**

```markdown
# 人工核对清单（提交前强制步骤）

对应设计文档"⑥ AI 建模方案与正文写作"的护栏：AI 起草的所有定量结论，定稿前必须逐条过这份清单，负责整合的人签字确认（哪怕只是在这份文件里打勾）后才能提交。

## 定量结论核对

- [ ] 正文里出现的每一个数值结果，是不是真的跑代码算出来的（不是 AI 凭经验编的"合理数字"）？
- [ ] 每一条公式推导，团队里至少一人独立手推/口头过一遍，确认没有跳步或错误？
- [ ] 图表里的数据和代码实际输出是否一致（没有为了"好看"手动改数）？
- [ ] AI 起草的模型假设，是否和实际用到的求解方法真的匹配（不是套话）？

## 建模方案核对（对应组件⑥"多方案生成"）

- [ ] AI 提出的候选方案里，团队是否真的理解了每个方案的原理，而不是选了个名字听起来对的？
- [ ] 选定方案后，是否核实了它对当前题目的数据/约束是适用的（不是从别的题目模板照搬）？

## 格式与合规核对（配合 `checklist/compliance_check.py`）

- [ ] 跑过 `python checklist/compliance_check.py <论文.tex>`，输出"未发现问题"？
- [ ] 参考文献是否按 `analysis/writing-style-guide.md` 的 GB/T 7714 格式？
- [ ] 是否过了一遍 `analysis/judge-deductions.md` 的每一条？

## 使用方式

赛时负责整合的人在提交前，把这份文件复制一份到当次比赛的工作目录，逐条打勾，勾不满不提交。
```

- [ ] **Step 2: 提交**

```bash
git add cumcm-toolkit/checklist/manual_verification.md
git commit -m "docs(数模国赛工具箱): 人工核对清单（AI 定量结论护栏）"
```

---

### Task 20: 建模方案提示词模板

**Files:**
- Create: `cumcm-toolkit/templates/model-proposal-prompt.md`

**Interfaces:**
- Consumes: `analysis/paper-structure.md`、`checklist/manual_verification.md`
- Produces: 赛时可直接复制进 Codex/Claude 对话框的提示词模板，供 Task 21（`AGENTS.md`）引用

- [ ] **Step 1: 写 templates/model-proposal-prompt.md**

```markdown
# 建模方案生成提示词模板

对应设计文档组件⑥。赛时拿到题目/子问题后，把下面的模板填好赛题信息，直接发给 Codex/Claude。

## 提示词模板

```
你是数学建模竞赛的建模顾问。这是本届国赛的一道子问题：

【题目原文】
<粘贴子问题原文>

【已知数据/约束】
<粘贴题目给的数据说明，或列出目前拿到的数据情况>

请完成：
1. 提出 2-4 个候选建模方案。每个方案说明：
   - 用什么方法（具体到方法名，比如"层次分析法"而不是"数学方法"）
   - 为什么适用这道题（结合题目的具体条件，不要套话）
   - 需要什么数据/前提，我们现在是否已经具备
   - 预期能得出什么形式的结果
   - 主要局限是什么
2. 如果 cumcm-toolkit/snippets/ 下有匹配的脚手架，指出具体是哪一个。
3. 不要在这一步直接写正文或编造数值结果——只提方案，我们确认方向后再进入下一步。
```

## 使用说明

- 拿到 AI 给出的多方案后，团队讨论选定方向，**不要**让 AI 替团队做最终选择——AI 提供选项和权衡，拍板是人的事
- 选定方向后进入建模和正文起草阶段，正文起草前提醒 AI："这一步开始起草正文，所有数值结果必须来自实际跑通的代码输出，不要编造"
- 起草完成后走一遍 `checklist/manual_verification.md`
```

- [ ] **Step 2: 提交**

```bash
git add cumcm-toolkit/templates/model-proposal-prompt.md
git commit -m "docs(数模国赛工具箱): 建模方案生成提示词模板"
```

---

### Task 21: AGENTS.md（Codex 入口）

**Files:**
- Create: `cumcm-toolkit/AGENTS.md`

**Interfaces:**
- Consumes: 前面所有任务产出的文件路径（引用，不修改）
- Produces: Codex 读取的项目级指令，供 Task 22 镜像成 Claude Skill

- [ ] **Step 1: 写 AGENTS.md**

```markdown
# cumcm-toolkit 使用指南（Codex 读取）

这是国赛备赛工具箱。赛时负责整合的人在这个仓库根目录打开 Codex 会话，其他两人直接打开对应文件手动参考，不需要各自开会话（详见设计文档"赛时使用方式"）。

## 写论文前先看

- 章节结构和篇幅占比：`analysis/paper-structure.md`
- 写作规范（时态/图表/公式/参考文献）：`analysis/writing-style-guide.md`
- 评委扣分点自查表：`analysis/judge-deductions.md`
- 三人共用符号表：`notation.md`（新符号先加进这里再用）

## 起草论文

- LaTeX 主模板：`templates/paper.tex`
- Word 备选模板：运行 `python templates/build_word_template.py <输出路径>` 生成
- 需要 AI 提建模方案时，用 `templates/model-proposal-prompt.md` 里的提示词模板，不要跳过"先出多方案再拍板"这一步

## 建模代码

`snippets/` 下按方法分目录，每个目录三件套：`model.py`（可直接调用的函数）、`README.md`（什么时候用/参数/怎么读结果/常见坑）、`test_*.py`（用法示例）。先看题目像哪一类，再进对应目录看 README，不要跳过 README 直接抄代码。

现有方法：`regression`（回归/拟合）、`ahp`（层次分析法）、`grey_prediction`（灰色预测）、`time_series`（ARIMA）、`graph_shortest_path`（图论最短路）、`linear_programming`（线性规划）、`monte_carlo`（蒙特卡洛仿真）、`topsis_entropy`（TOPSIS/熵权法）。

## 提交前必做

1. 跑 `python checklist/compliance_check.py <论文.tex>`，直到输出"未发现问题"
2. 逐条过 `checklist/manual_verification.md`，这是强制步骤，不是可选项——尤其是所有数值结果必须来自真实代码输出，不能是 AI 编的"合理数字"

## 工具箱本身在迭代

`analysis/`、`templates/`、`snippets/` 不是锁死的最终版。如果发现某处不趁手，或者又找到了新的金奖论文想补充分析，直接改，改完提交并在对应文件的"更新记录"里加一行。
```

- [ ] **Step 2: 提交**

```bash
git add cumcm-toolkit/AGENTS.md
git commit -m "feat(数模国赛工具箱): AGENTS.md Codex 入口"
```

---

### Task 22: Claude Skill 镜像

**Files:**
- Create: `cumcm-toolkit/.claude/skills/cumcm-toolkit/SKILL.md`

**Interfaces:**
- Consumes: `AGENTS.md`（内容对应，格式不同）

- [ ] **Step 1: 写 SKILL.md**

```markdown
---
name: cumcm-toolkit
description: 国赛（CUMCM）备赛工具箱——论文结构规范、写作规范、评委扣分点清单、LaTeX/Word 模板、建模代码脚手架、赛前提交合规检查。写论文、选建模方法、赛前自查时使用。
---

# cumcm-toolkit

备赛期间用 Claude Code 迭代这个工具箱本身时使用这份 skill；内容和 `AGENTS.md`（Codex 用）保持同步，改动时两边都要改。

## 写论文前先看

- 章节结构和篇幅占比：`analysis/paper-structure.md`
- 写作规范：`analysis/writing-style-guide.md`
- 评委扣分点自查表：`analysis/judge-deductions.md`
- 三人共用符号表：`notation.md`

## 起草论文

- LaTeX 主模板：`templates/paper.tex`
- Word 备选模板：`python templates/build_word_template.py <输出路径>`
- AI 建模方案提示词：`templates/model-proposal-prompt.md`

## 建模代码

`snippets/<method>/{model.py, README.md, test_*.py}`，方法列表见 `AGENTS.md`。

## 提交前必做

1. `python checklist/compliance_check.py <论文.tex>` 直到无问题
2. 逐条过 `checklist/manual_verification.md`

## 维护这个 skill

工具箱内容更新时（新语料、新分析结论、新脚手架），同步更新 `AGENTS.md` 和这份 `SKILL.md`，两者内容应该等价，只是格式适配不同工具。
```

- [ ] **Step 2: 提交**

```bash
git add "cumcm-toolkit/.claude/skills/cumcm-toolkit/SKILL.md"
git commit -m "feat(数模国赛工具箱): 镜像 Claude Skill"
```

---

### Task 23: 端到端集成验证演练

**Files:**
- Create: `cumcm-toolkit/drills/2026-integration-drill.md`

**Interfaces:**
- Consumes: `templates/paper.tex`、`snippets/regression/model.py`、`checklist/compliance_check.py`、`AGENTS.md`（验证这些产出物能否串起来用，不要求产出真实有效的建模结果）

- [ ] **Step 1: 选一道历年真题的题面（不要求实际正确建模，只验证工具链衔接）**

从 `corpus/manifest.md` 里选一道题（比如某年 A 题），只取题目背景描述部分。

- [ ] **Step 2: 跑一次"骨架级"全流程**

1. 复制 `templates/paper.tex` 为 `drills/_scratch/paper.tex`
2. 把选定题目的问题重述填进 `\section{问题重述}`
3. 假造一组简单数据（比如 5 个点），调用 `snippets/regression/model.py` 的 `fit_linear`，把返回的 `coef`/`intercept`/`r2` 填进模型求解部分
4. 编译：`cd drills/_scratch && pdflatex -interaction=nonstopmode paper.tex`，确认生成 PDF
5. 故意删掉一处 `\caption` 制造违规，跑 `python ../../checklist/compliance_check.py paper.tex`，确认能检测出来；改回来后再跑一次确认输出"未发现问题"

- [ ] **Step 3: 记录发现的问题**

```markdown
# 2026 集成验证演练记录

## 演练内容

用 <选定的题目> 的问题重述部分，跑了一次"模板 + 脚手架 + 合规检查"的骨架级全流程（不涉及真实建模）。

## 验证结果

- [ ] LaTeX 模板编译通过
- [ ] snippets/regression 能正常调用并把结果填进模板
- [ ] compliance_check.py 能正确检出人为制造的违规（缺 caption），修复后能通过

## 发现的问题

<如实记录哪里卡手，比如模板某个宏包报错、脚手架接口不好用、AGENTS.md 指引路径写错等，逐条记录并在对应任务的文件里修复>

## 后续行动

<如果这次演练发现问题并已修复，记一行"已修复：xxx"；如果需要团队后续真实建模演练时注意，记一行提醒>
```

清理临时文件：`rm -rf cumcm-toolkit/drills/_scratch`（临时验证产物不提交）。

- [ ] **Step 4: 如发现问题，回去修复对应任务的产出物，重跑 Step 2 直到通过**

- [ ] **Step 5: 提交**

```bash
git add cumcm-toolkit/drills/2026-integration-drill.md
git commit -m "test(数模国赛工具箱): 端到端集成验证演练"
```

---

### Task 24: 团队实战演练操作指南

**Files:**
- Create: `cumcm-toolkit/drills/README.md`

**Interfaces:**
- Consumes: 无（面向未来执行这件事的团队三人，不是 agent 自动执行）

- [ ] **Step 1: 写 drills/README.md**

```markdown
# 历年真题模拟演练操作指南

Task 23 做的是"工具链跑不跑得通"的技术验证。这份指南是给团队三人的——真正检验工具箱好不好用，需要一次真实的、有时间压力的建模演练，这一步只能人做，agent 代替不了。

## 怎么选题

从 `corpus/manifest.md` 里选一道：
- 题型和难度接近最近两届（2024、2025）
- 三人都还没读过题解/没被剧透过思路的题（不然演练失真）

## 怎么跑

1. 定一个时间盒（建议 1-2 天，别用满 72 小时，重点是压力测试工具箱不是拿奖）
2. 按 `AGENTS.md` 里写的流程走：先用 `templates/model-proposal-prompt.md` 让 AI 出候选方案 → 团队拍板 → 建模+写代码（尽量用 `snippets/` 起步）→ 用 `templates/paper.tex` 起草正文 → 过 `checklist/`
3. 全程记录卡手的地方——不管是模板排版问题、脚手架没覆盖到的方法、清单漏检了什么，还是 AI 出的方案不靠谱

## 演练之后

把发现的问题整理成一份 `drills/<日期>-real-drill.md`（格式参考 `2026-integration-drill.md`），然后回去修 `analysis/`、`templates/`、`snippets/`、`checklist/` 里对应的地方——这是"设计原则"里说的持续迭代，不是演练完就结束了。
```

- [ ] **Step 2: 提交**

```bash
git add cumcm-toolkit/drills/README.md
git commit -m "docs(数模国赛工具箱): 团队实战演练操作指南"
```
