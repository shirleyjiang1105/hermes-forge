---
name: spec-to-code-project
description: 从技术规格书到可运行代码项目的全流程脚手架搭建。解析规格书→模块拆解→并行子代理编码→集成验证→合成测试数据。用于复现论文、将方法学描述转为代码、或从AI生成的规格书搭建项目。触发：收到规格书/复现论文/按spec搭项目/把方法转成代码。
trigger_keywords:
  - 规格书
  - 复现
  - 按图施工
  - 搭项目
  - spec
  - reproduction
  - 把方法转成代码
  - 从spec
---

# Spec-to-Code: 规格书→可运行项目

## 触发条件
用户提供一份详细技术规格书（来自任何来源：Kimi/Claude/论文方法学章节/笔记），需要将其转换为完整的可运行代码项目。

## 执行流程

### Step 1：解析规格书 → 模块清单
快速扫描规格书，提取：
- 项目名称和目标
- 核心模块列表（model/training/evaluation/preprocessing/visualization）
- 每个模块的关键代码和依赖
- 数据需求和格式
- 交付物清单

### Step 2：创建标准目录结构
```
project-name/
├── src/
│   ├── models/        ← 核心模型架构
│   ├── training/      ← 训练循环+策略
│   ├── baselines/     ← 对照方法
│   ├── evaluation/    ← 评估指标+统计检验
│   ├── preprocessing/ ← 数据加载+处理
│   └── visualization/ ← 图表生成
├── configs/           ← YAML超参数
├── scripts/           ← 一键运行脚本
├── tests/             ← 合成数据+单元测试
├── notebooks/         ← 探索性分析
├── docs/              ← 方法学+结果文档
└── requirements.txt
```

### Step 3：并行子代理编码
将模块按依赖关系分成最多3组并行任务：

**组1（无依赖）**：模型代码 + 预处理/数据加载 + 配置YAML
**组2（依赖组1）**：训练策略 + baseline模型 + 评估指标
**组3（依赖组2）**：可视化 + 测试数据生成器 + 文档

每个子代理任务需包含：
- 完整的规格书上下文（代码片段、配置参数）
- 目标文件路径
- 明确接口要求（如sklearn fit/predict兼容）

### Step 4：集成验证
子代理完成后逐模块验证：
1. 全部模块可导入
2. Forward pass无维度错误
3. Loss可计算
4. Baseline可fit/predict
5. 合成数据生成器可运行
6. 数据加载器API正确

遇到bug立即修复（通常为API签名不匹配或张量维度错误）。

### Step 5：生成合成测试数据
创建 `tests/generate_synthetic_data.py`：
- 生成符合真实数据shape的模拟数据
- 组间差异可调（effect_size参数）
- 生成配套metadata
- 确保数据加载器可正确读取

### Step 6：输出使用说明
告诉用户：
- 数据放在哪个目录
- metadata.csv格式要求
- 一键运行命令
- 如何从合成数据切换到真实数据

## 注意事项
- 子代理超时常见——检查文件是否实际创建（超时≠失败）
- 模型API以规格书为准，但优先使用社区标准（sklearn/PyG接口）
- 合成数据shape必须与真实数据完全一致
- 项目放在 `~/research-mgmt/projects/` 下
