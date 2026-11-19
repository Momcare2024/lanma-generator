# EvoLink 模型选择设计

## 目标

把文案网站的默认 API 服务切换为 EvoLink。用户日常只需粘贴 EvoLink API Key，并从模型建议中选择需要的 Claude 模型；API 地址仍然保留并可编辑，便于以后更换供应商。

## 界面

- API 地址默认显示 `https://direct.evolink.ai/v1/messages`。
- 模型框继续使用当前可输入的下拉建议形式，既方便点击选择，也允许未来手动输入新模型。
- 提供三个主要选项：
  - `claude-sonnet-5-5`：日常写作（推荐），同时作为新用户默认值。
  - `claude-opus-5-5`：精品文章。
  - `claude-sonnet-4-6`：旧版对照。
- API Key 输入和“已记住”提示沿用现有逻辑。

## 配置与迁移

- 新访问者自动使用 EvoLink 地址和 Sonnet 5.5。
- 已保存 ClaudeCN 或 VectorEngine 配置的浏览器，在首次打开新版网站时自动切换到 EvoLink 地址，并清除旧供应商的 Key，避免把旧 Key 错发给 EvoLink。
- 已经使用其他自定义 API 地址的用户不被强制覆盖。
- 已保存的自定义模型名称继续保留；没有保存模型时使用 Sonnet 5.5。

## 请求流程

生成或续写文章时，网站继续从页面读取当前 API 地址、Key 和模型名称。请求体中的 `model` 字段使用用户选中的完整模型 ID，例如 `claude-sonnet-5-5`，由 EvoLink 据此路由到对应模型。

## 错误处理

- Key 为空时继续提示填写 API Key。
- 模型为空时继续提示填写模型名称。
- EvoLink 返回模型无权限、余额不足或 Key 错误时，继续显示接口返回的错误信息。

## 验证

- 自动化测试确认默认地址为 EvoLink、默认模型为 Sonnet 5.5，并包含三个指定模型选项。
- 自动化测试确认旧 ClaudeCN/VectorEngine 配置只迁移一次，且不会复用旧 Key。
- 自动化测试确认生成和续写都把当前选择的模型放入请求体。
- 在浏览器中检查地址栏、Key 输入框和模型下拉建议的实际显示。
