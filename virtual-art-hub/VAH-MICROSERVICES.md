# Virtual Arts Hub（VAH）微服务说明

本文档描述站点微服务化后的**逻辑边界**、**进程/容器拓扑**与**运维约定**，便于在云端部署与团队协作。

---

## 一、总体架构

```
浏览器 / 移动端
      │
      ▼
┌─────────────────┐     可选：云上 Ingress / CDN
│  vah-web        │     （Nginx 托管 React 静态资源，同机反代 API）
│  (Nginx+静态)   │
└────────┬────────┘
         │ /api , /socket.io
         ▼
┌─────────────────┐     路径级路由（见下文）
│  vah-gateway    │
│  (API Gateway)  │
└────┬───┬───┬────┘
     │   │   │
     ▼   ▼   ▼
 vah-auth  vah-gallery  vah-market  vah-realtime
 (Koa)     (Koa)         (Koa)        (Koa+Socket.IO)
     │           │              │              │
     └───────────┴──────────────┴──────────────┘
                         │
                    MySQL（共享库，现阶段与领域边界解耦并行）
```

**解耦策略（当前阶段）**

- **进程级解耦**：通过环境变量 `VAH_SERVICE` 在同一套 Koa 代码库中挂载不同路由集合，每个容器只暴露其领域 API，降低误调用面。
- **数据层**：仍使用单一 MySQL 库与既有 Sequelize 模型，减少分布式事务复杂度；后续若需可按域拆库并配合 Outbox/SAGA 演进。
- **网关**：对外统一入口，上游地址用环境变量配置，便于替换为云厂商托管 API 网关或 Service Mesh。

---

## 二、微服务一览

| 名称 | 代码入口 | 默认端口（容器内） | 职责摘要 |
|------|-----------|-------------------|----------|
| **vah-auth** | `backend-koa/server.js` + `VAH_SERVICE=auth` | `5101` | 注册/登录/JWT、`/auth/*`、头像与预设头像、`/users/:id/avatar`、管理员用户管理 `/admin/users/*`、API 根 `GET /api/` |
| **vah-gallery** | `VAH_SERVICE=gallery` | `5102` | 公开展厅、展厅/作品 CRUD、互动（评论/评分）、作品文件访问、展厅聊天历史、`/admin/artpieces/*` |
| **vah-market** | `VAH_SERVICE=market` | `5103` | 艺术品市场列表、购物车、下单、站内交易相关聊天 REST |
| **vah-realtime** | `VAH_SERVICE=realtime` | `5104` | Socket.IO：展厅实时消息、市场 DM、通用房间 |
| **vah-gateway** | `services/vah-gateway/index.js` | `5002` | 对外统一 HTTP/WebSocket 转发，按路径选择上游 |
| **vah-web** | 构建后的 React + Nginx | `80` | 静态 SPA，反向代理 `/api` 与 `/socket.io` 至网关 |

---

## 三、网关路由规则（摘要）

网关根据请求路径选择上游（详见 `services/vah-gateway/index.js`）：

| 路径前缀 | 上游 |
|----------|------|
| `/socket.io` | **vah-realtime** |
| `/api/market` | **vah-market** |
| `/api/admin/users` | **vah-auth** |
| `/api/admin/artpieces` | **vah-gallery** |
| `/api/auth`、`/api/users`、`/api/avatars` | **vah-auth** |
| 其余 `/api/*`（含 `/api/public`、`/api/galleries`、`/api/artpieces`、`/api/interactions`） | **vah-gallery** |

环境变量 `VAH_AUTH_ORIGIN`、`VAH_GALLERY_ORIGIN`、`VAH_MARKET_ORIGIN`、`VAH_REALTIME_ORIGIN` 可在云中指向 Kubernetes Service DNS 或负载均衡地址。

---

## 四、后端结构说明（单仓库模块化）

| 路径 | 说明 |
|------|------|
| `backend-koa/index.js` | 入口：加载 `server.js` |
| `backend-koa/server.js` | Koa 应用、`VAH_SERVICE` 条件挂载、`shouldMount(name)` |
| `backend-koa/db.js` | Sequelize 初始化，加载 `backend/models` |
| `backend/models/*` | 共享领域模型 |
| `backend/uploads/*` | 上传文件根目录（容器内需持久化卷） |
| `services/vah-gateway/` | 独立 Node 网关服务 |

---

## 五、本地开发模式

**单体（默认，兼容原习惯）**

```bash
cd backend-koa
npm install
npm start
# 未设置 VAH_SERVICE 时等价 VAH_SERVICE=all，挂载全部路由与 Socket.IO
```

前端 `npm start` 仍通过 `setupProxy.js` 将 `/api`、`/socket.io` 指向 `localhost:5002`。

**微服务 + 网关（可选）**

1. 分别启动四个后端进程（不同终端），设置 `VAH_SERVICE` 与 `PORT`（与 `docker-compose.yml` 中一致）。
2. 启动网关：`cd services/vah-gateway && npm install && npm start`，监听 `5002`。
3. 前端代理目标仍为 `http://127.0.0.1:5002`。

---

## 六、容器化与 Compose

- **Compose 文件**：仓库根目录 `virtual-art-hub/docker-compose.yml`
- **环境变量示例**：`deploy/env.docker.example` → 复制为 `.env.docker` 后：

```bash
docker compose --env-file .env.docker up -d --build
```

- **对外端口**：默认 Web `8080`（`vah-web`）、网关可直接映射 `VAH_GATEWAY_PUBLISH_PORT`（默认 `5002`）。

镜像构建文件位于 `deploy/Dockerfile.backend`、`deploy/Dockerfile.gateway`、`deploy/Dockerfile.frontend-with-proxy`。

---

## 七、DevOps 与上云

- **CI**：仓库 `.github/workflows/vah-devops.yml` 构建并推送 `vah-backend`、`vah-gateway`、`vah-web` 至 `ghcr.io`（推送发生在非 PR 的 push）。
- **K8s 与灰度**：见 `deploy/k8s/README.md`（Ingress 权重、Flagger、Argo Rollouts 等方案说明，无厂商锁定）。

---

## 八、演进建议

1. **消息与跨服务一致性**：头像更新驱动实时房间刷新，可在后续引入 Redis Pub/Sub 或消息队列，使 **auth** 与 **realtime** 完全无共享进程状态。
2. **按域拆库**：当单库成为瓶颈时，按 `auth`、`gallery`、`market` 拆分 schema 或实例，配合网关与 BFF 聚合查询。
3. **可观测性**：为每个服务接入 OpenTelemetry 日志/指标/链路，网关与 Ingress 侧记录 `X-Request-Id`。

---

如需调整路由分域或增加 BFF，请同步更新 **网关** 与本文档中的路径表。
