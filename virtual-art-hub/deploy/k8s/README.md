# Kubernetes 部署与灰度发布说明

以下内容说明如何将 Virtual Arts Hub（VAH）微服务部署到 Kubernetes，并实现灰度（金丝雀）发布。清单文件可按集群规范自行裁剪。

## 组件清单

| 工作负载 | 镜像 | 关键环境变量 |
|----------|------|----------------|
| `vah-auth` | `…/vah-backend` | `VAH_SERVICE=auth`, `PORT=5101` |
| `vah-gallery` | 同上 | `VAH_SERVICE=gallery`, `PORT=5102` |
| `vah-market` | 同上 | `VAH_SERVICE=market`, `PORT=5103` |
| `vah-realtime` | 同上 | `VAH_SERVICE=realtime`, `PORT=5104` |
| `vah-gateway` | `…/vah-gateway` | `VAH_*_ORIGIN` 指向 ClusterIP Service |
| `vah-web` | `…/vah-web` | Nginx 内置转发至 `vah-gateway` |

后端四个实例共用同一镜像，仅环境变量不同，便于镜像仓库治理与缓存。

## 云端运维要点

1. **配置与密钥**：使用 `Secret` 存放 `JWT_SECRET`、`DB_PASSWORD`；使用 `ConfigMap` 存放非敏感连接串。
2. **数据库**：生产建议使用托管 MySQL（RDS / Cloud SQL 等），`DB_HOST` 指向托管实例。
3. **探针**：为各 Deployment 配置 `readinessProbe` HTTP 调用 `GET /api`（auth 返回 JSON）或网关 `GET /health`。
4. **会话粘滞**：`vah-realtime`（WebSocket）经 `vah-gateway` 时，Service 建议 `sessionAffinity: ClientIP`（视规模可改为 Ingress 层粘滞）。
5. **上传与静态资源**：`backend/uploads` 对应持久卷（NFS / 对象存储挂载），多副本需共享存储。

## 灰度发布可选方案

任选其一与团队平台对齐即可。

### 1. Ingress-NGINX 基于权重的 Canary

为同一 Host 创建两条 Ingress 或.annotations 中 `canary: "true"` 与 `canary-weight`，新版本逐步调高权重。

### 2. Flagger（推荐与 Istio / NGINX / Gloo 等配合）

对 `vah-web` 或 `vah-gateway` 的 Deployment 创建 `Canary` 资源，自动基于成功率/延迟提升流量比例。

### 3. Argo Rollouts

使用 `Rollout` 替代 `Deployment`，配置 `canary.steps` 实现渐进流量。

### 4. 双 Deployment + Service 权重（服务网格）

在 Istio `VirtualService` 中对 `vah-gateway` 的两个版本设置比例路由。

---

仓库内未强制绑定某一网格实现，以便在不同云平台保持通用性；上线前请在预发环境验证 WebSocket 与健康检查。
