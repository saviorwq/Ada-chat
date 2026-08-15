# 人脸身份 + 多角色档案库（Ada Chat）

> **身份落地**：当前图生图锁脸仍用 **InsightFace 换脸**。  
> **MLP 投影**：接口已通（`project_face_vector`），权重为**未训练 stub**，`usable_for_identity=false`，不可当作真实 ID 条件注入。  
> **视频**：仅存储 `video_reserved_preset`，不实现生成。

## 目录

| 路径 | 说明 |
|------|------|
| `face_identity/` | 提取 / MLP / 角色库 / 条件解析 |
| `ai_data/character_library/` | 本地档案（gitignore） |
| `scripts/demo_character_*.py` | 最小 demo |

## 公共 API

```python
from face_identity import (
    extract_face_vector,          # -> (vec512, md5)
    project_face_vector,          # stub MLP
    create_character,
    get_character_condition,      # cid -> 向量 + 投影 + source_ref + presets
    resolve_face_source,          # temp_face_ref | bind_cid | fallback
)
```

异常：`FaceDetectNotFoundError`、`CharacterNotFoundError`。

## 图生图两种模式

**A 临时脸**：请求带 `temp_face` / `temp_face_ref`（另存 `_face.png`），构图底图仍为上传的 `image`。  
**B 角色库**：请求带 `bind_cid` + `use_char_preset`（可选），脸来自档案 `source_ref_img`。

采样注入区间 `inject_t_start/end`、`id_weight` **已写入预设**；在接上训练好的 Face Adapter 前，**不会**写入 UNet/DiT attention。换脸在生成结束后执行。

多 `bind_cid` 数组：数据结构预留，当前只处理**第一个**。

## Demo

```bash
# 1 建档
python scripts/demo_character_create.py --image path/to/face.jpg --name 小雪 --tags lead,female

# 2 临时脸 resolve
python scripts/demo_img2img_temp_face.py --temp-face path/to/face.jpg

# 3 角色条件
python scripts/demo_img2img_bind_cid.py --cid char_xxxxxxxxxxxx
```

CLI：`python face_identity/cli.py list|create|condition|resolve ...`

## 接入未来 UNet / DiT 交叉注意力（预留）

1. 用**已训练**的 IP-Adapter / InstantID / PuLID 等替换 `face_mlp_init.npz`（或旁路 `project_face_vector`）。  
2. 在采样循环中仅当 `t ∈ [inject_t_start, inject_t_end]` 时，把 `projected` 作为额外 cross-attn / 条件 token 混入（权重 `id_weight`）。  
3. Z-Image 为 DiT，需单独适配器，**不要**假设 SD1.5 IP-Adapter 可直接挂上。  
4. 在 Adapter 生效前，继续调用 `image_face_lock.swap_face_pil(source, scene)`。

## UI

图生图模式下拉：**角色库锁脸**（`list_characters`）。上传图 = 构图底图；选中角色 = 脸来源。

API：`list_characters` / `create_character` / `delete_character` / `rename_character`。
