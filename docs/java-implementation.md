# AI 智能客服系统 - Java 实现参考

> 用 Java/Spring Boot 重写核心模块，帮助理解系统设计

---

## 技术栈

```
Java 17 + Spring Boot 3.x
├── Web 框架：Spring MVC
├── WebSocket：Spring WebSocket + STOMP
├── ORM：MyBatis-Plus / JPA
├── 数据库：PostgreSQL
├── 缓存：Redis (Jedis/Lettuce)
├── 认证：Spring Security + JWT
└── API 文档：Swagger/OpenAPI
```

---

## 一、数据模型 (Entity)

### 1.1 枚举类型

```java
package com.game.cs.enums;

/**
 * 工单状态
 */
public enum TicketStatus {
    IN_PROGRESS,  // 处理中
    WAITING,      // 等待中
    RESOLVED      // 已解决
}

/**
 * 会话状态
 */
public enum SessionStatus {
    PENDING,      // 等待中（AI 服务）
    QUEUED,       // 排队中（等待人工）
    IN_PROGRESS,  // 进行中（人工服务）
    CLOSED        // 已关闭
}

/**
 * 消息发送者类型
 */
public enum SenderType {
    PLAYER,  // 玩家
    AI,      // AI
    AGENT,   // 客服
    SYSTEM   // 系统
}

/**
 * 消息类型
 */
public enum MessageType {
    TEXT,          // 文本
    IMAGE,         // 图片
    SYSTEM_NOTICE  // 系统通知
}

/**
 * 用户角色
 */
public enum UserRole {
    ADMIN,  // 管理员
    AGENT   // 客服
}

/**
 * 优先级
 */
public enum Priority {
    LOW,
    NORMAL,
    HIGH,
    URGENT
}
```

### 1.2 实体类

```java
package com.game.cs.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 游戏
 */
@Data
@TableName("game")
public class Game {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String name;
    private String icon;
    private Boolean enabled;
    private String difyApiKey;    // 加密存储
    private String difyBaseUrl;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deletedAt;
}

/**
 * 工单
 */
@Data
@TableName("ticket")
public class Ticket {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String ticketNo;       // 工单号，唯一
    private String gameId;
    private String serverId;
    private String serverName;
    private String playerIdOrName; // 玩家 ID 或名称
    private String description;    // 问题描述

    private TicketStatus status;
    private Priority priority;
    private Integer priorityScore; // 优先级分数 0-100

    private String token;          // 玩家访问令牌

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime closedAt;
    private LocalDateTime deletedAt;
}

/**
 * 会话
 */
@Data
@TableName("session")
public class Session {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String ticketId;
    private String agentId;        // 客服 ID，null 表示 AI 会话

    private SessionStatus status;
    private Integer priorityScore;
    private Integer queuePosition;  // 排队位置

    private LocalDateTime queuedAt;   // 入队时间
    private LocalDateTime startedAt;  // 开始时间
    private LocalDateTime closedAt;   // 关闭时间

    private String difyConversationId; // Dify 对话 ID

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

/**
 * 消息
 */
@Data
@TableName("message")
public class Message {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String sessionId;
    private SenderType senderType;
    private String senderId;       // 客服 ID（当 senderType 为 AGENT 时）
    private String content;
    private MessageType messageType;

    private LocalDateTime createdAt;
}

/**
 * 用户（客服/管理员）
 */
@Data
@TableName("user")
public class User {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String username;
    private String password;       // BCrypt 加密
    private UserRole role;
    private String realName;
    private String email;
    private String avatar;

    private Boolean isOnline;      // 是否在线
    private LocalDateTime lastLoginAt;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deletedAt;
}
```

---

## 二、工单模块 (Ticket)

### 2.1 Controller

```java
package com.game.cs.controller;

import com.game.cs.dto.*;
import com.game.cs.service.TicketService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "工单管理")
@RestController
@RequestMapping("/api/v1/tickets")
@RequiredArgsConstructor
public class TicketController {

    private final TicketService ticketService;

    /**
     * 创建工单（玩家端，无需认证）
     */
    @Operation(summary = "创建工单")
    @PostMapping("/create")
    public CreateTicketResponse create(@RequestBody @Valid CreateTicketDTO dto) {
        return ticketService.create(dto);
    }

    /**
     * 根据 token 获取工单（玩家端）
     */
    @Operation(summary = "根据 token 获取工单")
    @GetMapping("/by-token/{token}")
    public TicketDetailResponse findByToken(@PathVariable String token) {
        return ticketService.findByToken(token);
    }

    /**
     * 查询玩家未完成的工单
     */
    @Operation(summary = "查询未完成工单")
    @PostMapping("/query-open-tickets")
    public List<TicketBriefResponse> queryOpenTickets(@RequestBody QueryOpenTicketsDTO dto) {
        return ticketService.queryOpenTickets(dto);
    }

    /**
     * 工单列表（管理端，需要认证）
     */
    @Operation(summary = "工单列表")
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'AGENT')")
    public PageResult<TicketListResponse> list(TicketQueryDTO query) {
        return ticketService.list(query);
    }

    /**
     * 更新工单状态
     */
    @Operation(summary = "更新工单状态")
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'AGENT')")
    public TicketDetailResponse updateStatus(
            @PathVariable String id,
            @RequestBody UpdateTicketStatusDTO dto) {
        return ticketService.updateStatus(id, dto);
    }
}
```

### 2.2 Service

```java
package com.game.cs.service;

import com.game.cs.dto.*;
import com.game.cs.entity.Ticket;
import com.game.cs.enums.TicketStatus;
import com.game.cs.exception.NotFoundException;
import com.game.cs.mapper.TicketMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TicketService {

    private final TicketMapper ticketMapper;
    private final SessionService sessionService;
    private final IssueTypeService issueTypeService;

    /**
     * 创建工单
     */
    @Transactional
    public CreateTicketResponse create(CreateTicketDTO dto) {
        // 1. 生成工单号和 token
        String ticketNo = generateTicketNo();
        String token = UUID.randomUUID().toString();

        // 2. 计算优先级
        int priorityScore = calculatePriorityScore(dto.getIssueTypeIds());

        // 3. 创建工单
        Ticket ticket = new Ticket();
        ticket.setTicketNo(ticketNo);
        ticket.setGameId(dto.getGameId());
        ticket.setServerName(dto.getServerName());
        ticket.setPlayerIdOrName(dto.getPlayerIdOrName());
        ticket.setDescription(dto.getDescription());
        ticket.setStatus(TicketStatus.IN_PROGRESS);
        ticket.setPriorityScore(priorityScore);
        ticket.setToken(token);
        ticket.setCreatedAt(LocalDateTime.now());
        ticket.setUpdatedAt(LocalDateTime.now());

        ticketMapper.insert(ticket);

        log.info("创建工单: ticketNo={}, gameId={}, player={}",
                ticketNo, dto.getGameId(), dto.getPlayerIdOrName());

        // 4. 判断是否需要直接转人工
        boolean requiresDirectTransfer = issueTypeService
                .requiresDirectTransfer(dto.getIssueTypeIds());

        // 5. 如果需要直接转人工，创建会话并进入排队
        String sessionId = null;
        if (requiresDirectTransfer) {
            sessionId = sessionService.createAndQueue(ticket.getId());
        }

        return CreateTicketResponse.builder()
                .id(ticket.getId())
                .ticketNo(ticketNo)
                .token(token)
                .sessionId(sessionId)
                .requiresDirectTransfer(requiresDirectTransfer)
                .build();
    }

    /**
     * 根据 token 查询工单
     */
    public TicketDetailResponse findByToken(String token) {
        Ticket ticket = ticketMapper.findByToken(token);
        if (ticket == null) {
            throw new NotFoundException("工单不存在");
        }
        return convertToDetailResponse(ticket);
    }

    /**
     * 查询玩家未完成的工单
     */
    public List<TicketBriefResponse> queryOpenTickets(QueryOpenTicketsDTO dto) {
        List<Ticket> tickets = ticketMapper.findOpenTickets(
                dto.getGameId(),
                dto.getPlayerIdOrName(),
                dto.getServerName()
        );
        return tickets.stream()
                .map(this::convertToBriefResponse)
                .toList();
    }

    /**
     * 更新工单状态
     */
    @Transactional
    public TicketDetailResponse updateStatus(String id, UpdateTicketStatusDTO dto) {
        Ticket ticket = ticketMapper.selectById(id);
        if (ticket == null) {
            throw new NotFoundException("工单不存在");
        }

        ticket.setStatus(dto.getStatus());
        ticket.setUpdatedAt(LocalDateTime.now());

        if (dto.getStatus() == TicketStatus.RESOLVED) {
            ticket.setClosedAt(LocalDateTime.now());
        }

        ticketMapper.updateById(ticket);

        log.info("更新工单状态: id={}, status={}", id, dto.getStatus());

        return convertToDetailResponse(ticket);
    }

    /**
     * 生成工单号
     */
    private String generateTicketNo() {
        // 格式：TK + 年月日 + 6位序号
        // 例如：TK20241229000001
        String dateStr = LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        int sequence = ticketMapper.countTodayTickets() + 1;
        return String.format("TK%s%06d", dateStr, sequence);
    }

    /**
     * 计算优先级分数
     */
    private int calculatePriorityScore(List<String> issueTypeIds) {
        if (issueTypeIds == null || issueTypeIds.isEmpty()) {
            return 50; // 默认分数
        }
        // 取所有问题类型中最高的权重
        return issueTypeService.getMaxPriorityWeight(issueTypeIds);
    }
}
```

---

## 三、会话模块 (Session)

### 3.1 Service

```java
package com.game.cs.service;

import com.game.cs.dto.*;
import com.game.cs.entity.Session;
import com.game.cs.entity.Ticket;
import com.game.cs.enums.SessionStatus;
import com.game.cs.exception.NotFoundException;
import com.game.cs.exception.BusinessException;
import com.game.cs.mapper.SessionMapper;
import com.game.cs.websocket.WebSocketService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionService {

    private final SessionMapper sessionMapper;
    private final TicketMapper ticketMapper;
    private final QueueService queueService;
    private final MessageService messageService;
    private final DifyService difyService;
    private final WebSocketService webSocketService;
    private final UserService userService;

    /**
     * 创建会话
     */
    @Transactional
    public SessionDetailResponse create(String ticketId) {
        Ticket ticket = ticketMapper.selectById(ticketId);
        if (ticket == null) {
            throw new NotFoundException("工单不存在");
        }

        Session session = new Session();
        session.setTicketId(ticketId);
        session.setStatus(SessionStatus.PENDING);
        session.setPriorityScore(ticket.getPriorityScore());
        session.setCreatedAt(LocalDateTime.now());
        session.setUpdatedAt(LocalDateTime.now());

        sessionMapper.insert(session);

        log.info("创建会话: sessionId={}, ticketId={}", session.getId(), ticketId);

        // 通知管理端有新会话
        webSocketService.notifyNewSession(session);

        return convertToDetailResponse(session);
    }

    /**
     * 创建会话并直接进入排队
     */
    @Transactional
    public String createAndQueue(String ticketId) {
        SessionDetailResponse session = create(ticketId);
        transferToAgent(session.getId(), new TransferToAgentDTO());
        return session.getId();
    }

    /**
     * 发送消息（玩家）
     */
    @Transactional
    public MessageResponse sendPlayerMessage(String sessionId, String content) {
        Session session = getSessionOrThrow(sessionId);

        // 1. 保存玩家消息
        MessageResponse playerMessage = messageService.create(
                sessionId, content, SenderType.PLAYER, null);

        // 2. 广播消息
        webSocketService.notifyMessage(sessionId, playerMessage);

        // 3. 如果是 AI 会话，调用 AI 回复
        if (session.getAgentId() == null && session.getStatus() == SessionStatus.PENDING) {
            processAiReply(session, content);
        }

        return playerMessage;
    }

    /**
     * 处理 AI 回复
     */
    private void processAiReply(Session session, String playerMessage) {
        try {
            // 调用 Dify API
            DifyResponse response = difyService.chat(
                    session.getTicketId(),
                    session.getDifyConversationId(),
                    playerMessage
            );

            // 更新 conversation_id（首次对话时）
            if (session.getDifyConversationId() == null) {
                session.setDifyConversationId(response.getConversationId());
                sessionMapper.updateById(session);
            }

            // 保存 AI 消息
            MessageResponse aiMessage = messageService.create(
                    session.getId(),
                    response.getAnswer(),
                    SenderType.AI,
                    null
            );

            // 广播 AI 消息
            webSocketService.notifyMessage(session.getId(), aiMessage);

        } catch (Exception e) {
            log.error("AI 回复失败: sessionId={}, error={}", session.getId(), e.getMessage());
            // AI 失败时发送系统消息
            messageService.createSystemMessage(session.getId(), "AI 服务暂时不可用，请稍后重试或转人工客服");
        }
    }

    /**
     * 转人工客服
     */
    @Transactional
    public TransferResult transferToAgent(String sessionId, TransferToAgentDTO dto) {
        Session session = getSessionOrThrow(sessionId);

        // 1. 检查是否有在线客服
        int onlineAgentCount = userService.countOnlineAgents();
        if (onlineAgentCount == 0) {
            // 没有在线客服，转为加急工单
            return convertToUrgentTicket(session, dto);
        }

        // 2. 计算优先级
        int priorityScore = calculateTransferPriority(session, dto);

        // 3. 更新会话状态为排队
        LocalDateTime queuedAt = LocalDateTime.now();
        session.setStatus(SessionStatus.QUEUED);
        session.setPriorityScore(priorityScore);
        session.setQueuedAt(queuedAt);
        session.setUpdatedAt(LocalDateTime.now());
        sessionMapper.updateById(session);

        // 4. 添加到 Redis 排队队列
        queueService.addToQueue(sessionId, priorityScore, queuedAt);

        // 5. 重新计算排队位置
        queueService.reorderQueue();

        // 6. 获取排队位置
        int queuePosition = queueService.getQueuePosition(sessionId);
        int estimatedWaitTime = calculateWaitTime(queuePosition, onlineAgentCount);

        // 7. 发送系统消息
        messageService.createSystemMessage(sessionId,
                String.format("正在为您转接人工客服，当前排队位置：%d，预计等待时间：%d 分钟",
                        queuePosition, estimatedWaitTime));

        // 8. 通知排队更新
        webSocketService.notifyQueueUpdate(sessionId, queuePosition, estimatedWaitTime);
        webSocketService.notifySessionUpdate(sessionId, session);

        log.info("转人工: sessionId={}, queuePosition={}", sessionId, queuePosition);

        return TransferResult.builder()
                .queued(true)
                .queuePosition(queuePosition)
                .estimatedWaitTime(estimatedWaitTime)
                .onlineAgents(onlineAgentCount)
                .build();
    }

    /**
     * 客服接入会话
     */
    @Transactional
    public SessionDetailResponse agentAccept(String sessionId, String agentId) {
        Session session = getSessionOrThrow(sessionId);

        // 验证会话状态
        if (session.getStatus() != SessionStatus.QUEUED) {
            throw new BusinessException("会话状态不正确，无法接入");
        }

        // 验证客服权限（如果已分配给其他客服）
        if (session.getAgentId() != null && !session.getAgentId().equals(agentId)) {
            throw new BusinessException("该会话已分配给其他客服");
        }

        // 更新会话状态
        session.setAgentId(agentId);
        session.setStatus(SessionStatus.IN_PROGRESS);
        session.setStartedAt(LocalDateTime.now());
        session.setUpdatedAt(LocalDateTime.now());
        sessionMapper.updateById(session);

        // 从排队队列移除
        queueService.removeFromQueue(sessionId);

        // 发送系统消息
        User agent = userService.findById(agentId);
        messageService.createSystemMessage(sessionId,
                String.format("客服 %s 已接入，将为您服务", agent.getRealName()));

        // 通知会话更新
        webSocketService.notifySessionUpdate(sessionId, session);
        webSocketService.notifyAgentJoined(sessionId, agent);

        log.info("客服接入: sessionId={}, agentId={}", sessionId, agentId);

        return convertToDetailResponse(session);
    }

    /**
     * 关闭会话
     */
    @Transactional
    public SessionDetailResponse close(String sessionId, String closedBy) {
        Session session = getSessionOrThrow(sessionId);

        if (session.getStatus() == SessionStatus.CLOSED) {
            return convertToDetailResponse(session);
        }

        // 更新会话状态
        session.setStatus(SessionStatus.CLOSED);
        session.setClosedAt(LocalDateTime.now());
        session.setUpdatedAt(LocalDateTime.now());
        sessionMapper.updateById(session);

        // 从排队队列移除（如果在排队中）
        queueService.removeFromQueue(sessionId);

        // 发送系统消息
        messageService.createSystemMessage(sessionId, "会话已结束，感谢您的咨询");

        // 通知会话更新
        webSocketService.notifySessionUpdate(sessionId, session);

        log.info("关闭会话: sessionId={}, closedBy={}", sessionId, closedBy);

        return convertToDetailResponse(session);
    }

    /**
     * 转为加急工单（无客服在线时）
     */
    private TransferResult convertToUrgentTicket(Session session, TransferToAgentDTO dto) {
        // 1. 关闭当前会话
        session.setStatus(SessionStatus.CLOSED);
        session.setClosedAt(LocalDateTime.now());
        sessionMapper.updateById(session);

        // 2. 更新工单为加急
        Ticket ticket = ticketMapper.selectById(session.getTicketId());
        ticket.setStatus(TicketStatus.WAITING);
        ticket.setPriority(Priority.URGENT);
        ticket.setPriorityScore(Math.max(ticket.getPriorityScore(), 80));
        ticketMapper.updateById(ticket);

        // 3. 发送系统消息
        messageService.createSystemMessage(session.getId(),
                String.format("当前暂无客服在线，您的问题已转为【加急工单】(%s)，我们将优先处理",
                        ticket.getTicketNo()));

        log.info("转为加急工单: sessionId={}, ticketNo={}", session.getId(), ticket.getTicketNo());

        return TransferResult.builder()
                .queued(false)
                .convertedToTicket(true)
                .ticketNo(ticket.getTicketNo())
                .message("当前暂无客服在线，您的问题已转为加急工单")
                .build();
    }

    private Session getSessionOrThrow(String sessionId) {
        Session session = sessionMapper.selectById(sessionId);
        if (session == null) {
            throw new NotFoundException("会话不存在");
        }
        return session;
    }

    private int calculateWaitTime(int position, int agentCount) {
        if (agentCount == 0) return -1;
        int avgProcessingTime = 5; // 平均处理时间（分钟）
        return (int) Math.ceil((double) position / agentCount * avgProcessingTime);
    }
}
```

---

## 四、WebSocket 实时通信

### 4.1 配置类

```java
package com.game.cs.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // 客户端订阅地址前缀（服务端推送）
        config.enableSimpleBroker("/topic", "/queue");
        // 客户端发送消息前缀
        config.setApplicationDestinationPrefixes("/app");
        // 点对点消息前缀
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS(); // 支持 SockJS 降级
    }
}
```

### 4.2 WebSocket 控制器

```java
package com.game.cs.websocket;

import com.game.cs.dto.*;
import com.game.cs.service.SessionService;
import com.game.cs.service.MessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.*;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Slf4j
@Controller
@RequiredArgsConstructor
public class WebSocketController {

    private final SessionService sessionService;
    private final MessageService messageService;

    /**
     * 玩家发送消息
     * 前端调用: stompClient.send("/app/send-message", {}, JSON.stringify(data))
     */
    @MessageMapping("/send-message")
    public void handlePlayerMessage(@Payload SendMessageDTO data,
                                    SimpMessageHeaderAccessor headerAccessor) {
        log.debug("收到玩家消息: sessionId={}, content={}",
                data.getSessionId(), data.getContent());

        sessionService.sendPlayerMessage(data.getSessionId(), data.getContent());
    }

    /**
     * 客服发送消息
     */
    @MessageMapping("/agent/send-message")
    public void handleAgentMessage(@Payload SendMessageDTO data,
                                   Principal principal) {
        String agentId = principal.getName();

        log.debug("收到客服消息: sessionId={}, agentId={}, content={}",
                data.getSessionId(), agentId, data.getContent());

        sessionService.sendAgentMessage(data.getSessionId(), data.getContent(), agentId);
    }

    /**
     * 加入会话房间
     */
    @MessageMapping("/join-session")
    public void handleJoinSession(@Payload JoinSessionDTO data,
                                  SimpMessageHeaderAccessor headerAccessor) {
        String sessionAttr = "sessionId";
        headerAccessor.getSessionAttributes().put(sessionAttr, data.getSessionId());

        log.info("客户端加入会话: sessionId={}", data.getSessionId());
    }

    /**
     * 离开会话房间
     */
    @MessageMapping("/leave-session")
    public void handleLeaveSession(@Payload LeaveSessionDTO data,
                                   SimpMessageHeaderAccessor headerAccessor) {
        headerAccessor.getSessionAttributes().remove("sessionId");

        log.info("客户端离开会话: sessionId={}", data.getSessionId());
    }

    /**
     * 心跳检测
     */
    @MessageMapping("/ping")
    @SendTo("/topic/pong")
    public PongResponse handlePing() {
        return new PongResponse(System.currentTimeMillis());
    }
}
```

### 4.3 WebSocket 服务（服务端主动推送）

```java
package com.game.cs.websocket;

import com.game.cs.dto.*;
import com.game.cs.entity.Session;
import com.game.cs.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebSocketService {

    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 通知新消息
     * 订阅地址: /topic/session/{sessionId}/message
     */
    public void notifyMessage(String sessionId, MessageResponse message) {
        String destination = "/topic/session/" + sessionId + "/message";
        messagingTemplate.convertAndSend(destination, message);
        log.debug("推送消息: sessionId={}, messageId={}", sessionId, message.getId());
    }

    /**
     * 通知会话更新
     * 订阅地址: /topic/session/{sessionId}/update
     */
    public void notifySessionUpdate(String sessionId, Session session) {
        String destination = "/topic/session/" + sessionId + "/update";
        messagingTemplate.convertAndSend(destination, SessionUpdateDTO.from(session));
        log.debug("推送会话更新: sessionId={}, status={}", sessionId, session.getStatus());
    }

    /**
     * 通知排队更新
     * 订阅地址: /topic/session/{sessionId}/queue
     */
    public void notifyQueueUpdate(String sessionId, int position, int waitTime) {
        String destination = "/topic/session/" + sessionId + "/queue";
        QueueUpdateDTO update = new QueueUpdateDTO(position, waitTime);
        messagingTemplate.convertAndSend(destination, update);
        log.debug("推送排队更新: sessionId={}, position={}", sessionId, position);
    }

    /**
     * 通知新会话（广播给所有客服）
     * 订阅地址: /topic/new-session
     */
    public void notifyNewSession(Session session) {
        messagingTemplate.convertAndSend("/topic/new-session", SessionBriefDTO.from(session));
        log.debug("推送新会话: sessionId={}", session.getId());
    }

    /**
     * 通知客服加入
     * 订阅地址: /topic/session/{sessionId}/agent-joined
     */
    public void notifyAgentJoined(String sessionId, User agent) {
        String destination = "/topic/session/" + sessionId + "/agent-joined";
        AgentInfoDTO agentInfo = AgentInfoDTO.from(agent);
        messagingTemplate.convertAndSend(destination, agentInfo);
        log.debug("推送客服加入: sessionId={}, agentId={}", sessionId, agent.getId());
    }

    /**
     * 通知客服状态变化（全局广播）
     * 订阅地址: /topic/agent-status
     */
    public void notifyAgentStatusChange(String agentId, boolean isOnline, User agent) {
        AgentStatusDTO status = new AgentStatusDTO(agentId, isOnline,
                agent.getUsername(), agent.getRealName());
        messagingTemplate.convertAndSend("/topic/agent-status", status);
        log.debug("推送客服状态: agentId={}, isOnline={}", agentId, isOnline);
    }
}
```

### 4.4 连接事件监听

```java
package com.game.cs.websocket;

import com.game.cs.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.*;

import java.security.Principal;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketEventListener {

    private final UserService userService;
    private final WebSocketService webSocketService;

    /**
     * WebSocket 连接建立
     */
    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        Principal principal = headerAccessor.getUser();

        if (principal != null) {
            // 客服/管理员连接
            String userId = principal.getName();
            userService.updateOnlineStatus(userId, true);

            User user = userService.findById(userId);
            webSocketService.notifyAgentStatusChange(userId, true, user);

            log.info("客服连接: userId={}", userId);
        } else {
            // 玩家连接
            log.info("玩家连接: sessionId={}", headerAccessor.getSessionId());
        }
    }

    /**
     * WebSocket 连接断开
     */
    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        Principal principal = headerAccessor.getUser();

        if (principal != null) {
            // 客服/管理员断开
            String userId = principal.getName();
            userService.updateOnlineStatus(userId, false);

            User user = userService.findById(userId);
            webSocketService.notifyAgentStatusChange(userId, false, user);

            log.info("客服断开: userId={}", userId);
        } else {
            // 玩家断开
            log.info("玩家断开: sessionId={}", headerAccessor.getSessionId());
        }
    }
}
```

---

## 五、排队机制 (Redis)

### 5.1 队列服务

```java
package com.game.cs.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class QueueService {

    private final RedisTemplate<String, String> redisTemplate;

    // Redis Key
    private static final String QUEUE_KEY = "cs:queue:waiting";
    private static final String QUEUE_INFO_KEY = "cs:queue:info:";

    /**
     * 添加到排队队列
     *
     * 使用 Redis Sorted Set（有序集合）
     * - member: sessionId
     * - score: 优先级分数（越高越优先）+ 时间因子（越早越优先）
     */
    public void addToQueue(String sessionId, int priorityScore, LocalDateTime queuedAt) {
        // 计算 score：优先级 * 1000000 - 入队时间戳
        // 这样优先级高的在前面，同优先级按入队时间排序
        double score = priorityScore * 1_000_000.0 -
                queuedAt.toEpochSecond(ZoneOffset.UTC);

        redisTemplate.opsForZSet().add(QUEUE_KEY, sessionId, score);

        // 保存入队信息
        String infoKey = QUEUE_INFO_KEY + sessionId;
        redisTemplate.opsForHash().put(infoKey, "priorityScore", String.valueOf(priorityScore));
        redisTemplate.opsForHash().put(infoKey, "queuedAt", queuedAt.toString());

        log.debug("添加到队列: sessionId={}, score={}", sessionId, score);
    }

    /**
     * 从队列移除
     */
    public void removeFromQueue(String sessionId) {
        redisTemplate.opsForZSet().remove(QUEUE_KEY, sessionId);
        redisTemplate.delete(QUEUE_INFO_KEY + sessionId);

        log.debug("从队列移除: sessionId={}", sessionId);
    }

    /**
     * 获取排队位置（从 1 开始）
     */
    public int getQueuePosition(String sessionId) {
        Long rank = redisTemplate.opsForZSet().reverseRank(QUEUE_KEY, sessionId);
        return rank == null ? -1 : rank.intValue() + 1;
    }

    /**
     * 获取队列长度
     */
    public long getQueueLength() {
        Long size = redisTemplate.opsForZSet().size(QUEUE_KEY);
        return size == null ? 0 : size;
    }

    /**
     * 获取队列中优先级最高的会话
     */
    public String getTopSession() {
        Set<String> top = redisTemplate.opsForZSet().reverseRange(QUEUE_KEY, 0, 0);
        return (top == null || top.isEmpty()) ? null : top.iterator().next();
    }

    /**
     * 获取队列中前 N 个会话
     */
    public Set<String> getTopSessions(int count) {
        return redisTemplate.opsForZSet().reverseRange(QUEUE_KEY, 0, count - 1);
    }

    /**
     * 更新会话优先级
     */
    public void updatePriority(String sessionId, int newPriorityScore) {
        // 获取原入队时间
        String infoKey = QUEUE_INFO_KEY + sessionId;
        String queuedAtStr = (String) redisTemplate.opsForHash().get(infoKey, "queuedAt");

        if (queuedAtStr != null) {
            LocalDateTime queuedAt = LocalDateTime.parse(queuedAtStr);
            double score = newPriorityScore * 1_000_000.0 -
                    queuedAt.toEpochSecond(ZoneOffset.UTC);

            redisTemplate.opsForZSet().add(QUEUE_KEY, sessionId, score);
            redisTemplate.opsForHash().put(infoKey, "priorityScore", String.valueOf(newPriorityScore));

            log.debug("更新优先级: sessionId={}, newScore={}", sessionId, newPriorityScore);
        }
    }

    /**
     * 重新排序队列（更新所有会话的排队位置）
     */
    public void reorderQueue() {
        Set<ZSetOperations.TypedTuple<String>> all =
                redisTemplate.opsForZSet().reverseRangeWithScores(QUEUE_KEY, 0, -1);

        if (all == null) return;

        int position = 1;
        for (ZSetOperations.TypedTuple<String> tuple : all) {
            String sessionId = tuple.getValue();
            // 更新数据库中的排队位置
            sessionMapper.updateQueuePosition(sessionId, position);
            position++;
        }

        log.debug("重新排序队列，共 {} 个会话", all.size());
    }
}
```

---

## 六、AI 集成 (Dify)

### 6.1 Dify 服务

```java
package com.game.cs.service;

import com.game.cs.dto.DifyRequest;
import com.game.cs.dto.DifyResponse;
import com.game.cs.entity.Game;
import com.game.cs.entity.Ticket;
import com.game.cs.exception.DifyException;
import com.game.cs.mapper.GameMapper;
import com.game.cs.mapper.TicketMapper;
import com.game.cs.util.EncryptionUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Slf4j
@Service
@RequiredArgsConstructor
public class DifyService {

    private final RestTemplate restTemplate;
    private final GameMapper gameMapper;
    private final TicketMapper ticketMapper;
    private final EncryptionUtil encryptionUtil;

    /**
     * 调用 Dify 聊天接口
     *
     * @param ticketId       工单 ID（用于获取游戏配置）
     * @param conversationId 对话 ID（用于保持上下文）
     * @param message        用户消息
     * @return AI 回复
     */
    public DifyResponse chat(String ticketId, String conversationId, String message) {
        // 1. 获取工单和游戏配置
        Ticket ticket = ticketMapper.selectById(ticketId);
        Game game = gameMapper.selectById(ticket.getGameId());

        // 2. 解密 API Key
        String apiKey = encryptionUtil.decrypt(game.getDifyApiKey());
        String baseUrl = game.getDifyBaseUrl();

        // 3. 构建请求
        String url = baseUrl + "/chat-messages";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        DifyRequest request = DifyRequest.builder()
                .query(message)
                .conversationId(conversationId)
                .user(ticket.getPlayerIdOrName())
                .inputs(buildInputs(ticket))
                .responseMode("blocking")
                .build();

        HttpEntity<DifyRequest> entity = new HttpEntity<>(request, headers);

        try {
            log.debug("调用 Dify: ticketId={}, message={}", ticketId, message);

            ResponseEntity<DifyResponse> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    DifyResponse.class
            );

            DifyResponse body = response.getBody();
            if (body == null) {
                throw new DifyException("Dify 返回空响应");
            }

            log.debug("Dify 回复: conversationId={}, answer={}",
                    body.getConversationId(), body.getAnswer());

            return body;

        } catch (Exception e) {
            log.error("Dify 调用失败: ticketId={}, error={}", ticketId, e.getMessage());
            throw new DifyException("AI 服务调用失败: " + e.getMessage());
        }
    }

    /**
     * AI 话术优化
     */
    public String optimizeReply(String ticketId, String originalReply) {
        String prompt = String.format(
                "请优化以下客服回复，使其更加专业、友好：\n\n原始回复：%s\n\n优化后的回复：",
                originalReply
        );

        DifyResponse response = chat(ticketId, null, prompt);
        return response.getAnswer();
    }

    /**
     * 构建 Dify 输入参数
     */
    private Map<String, String> buildInputs(Ticket ticket) {
        Map<String, String> inputs = new HashMap<>();
        inputs.put("game_name", ticket.getGameId()); // 实际应该查询游戏名称
        inputs.put("player_id", ticket.getPlayerIdOrName());
        inputs.put("issue_description", ticket.getDescription());
        return inputs;
    }
}
```

### 6.2 DTO 类

```java
package com.game.cs.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class DifyRequest {
    private String query;

    @JsonProperty("conversation_id")
    private String conversationId;

    private String user;

    private Map<String, String> inputs;

    @JsonProperty("response_mode")
    private String responseMode;
}

@Data
public class DifyResponse {
    private String answer;

    @JsonProperty("conversation_id")
    private String conversationId;

    @JsonProperty("message_id")
    private String messageId;

    private DifyMetadata metadata;
}

@Data
public class DifyMetadata {
    private int tokens;
    private double cost;
}
```

---

## 七、认证模块 (JWT)

### 7.1 Security 配置

```java
package com.game.cs.config;

import com.game.cs.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // 公开接口（玩家端）
                .requestMatchers(
                    "/api/v1/tickets/create",
                    "/api/v1/tickets/by-token/**",
                    "/api/v1/tickets/query-open-tickets",
                    "/api/v1/games/enabled",
                    "/api/v1/sessions/*/messages",
                    "/api/v1/auth/login",
                    "/ws/**"
                ).permitAll()
                // 管理端接口需要认证
                .requestMatchers("/api/v1/**").authenticated()
                .anyRequest().permitAll()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

### 7.2 JWT 过滤器

```java
package com.game.cs.security;

import com.game.cs.service.JwtService;
import com.game.cs.service.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserService userService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);

        try {
            String userId = jwtService.extractUserId(token);

            if (userId != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                User user = userService.findById(userId);

                if (user != null && jwtService.isTokenValid(token, user)) {
                    UsernamePasswordAuthenticationToken authToken =
                            new UsernamePasswordAuthenticationToken(
                                    user,
                                    null,
                                    user.getAuthorities()
                            );
                    authToken.setDetails(new WebAuthenticationDetailsSource()
                            .buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                }
            }
        } catch (Exception e) {
            // Token 无效，继续执行（让 Security 处理未认证请求）
        }

        filterChain.doFilter(request, response);
    }
}
```

### 7.3 JWT 服务

```java
package com.game.cs.service;

import com.game.cs.entity.User;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.Key;
import java.util.Date;

@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private long expiration; // 毫秒

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes());
    }

    /**
     * 生成 JWT Token
     */
    public String generateToken(User user) {
        return Jwts.builder()
                .setSubject(user.getId())
                .claim("username", user.getUsername())
                .claim("role", user.getRole().name())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    /**
     * 从 Token 中提取用户 ID
     */
    public String extractUserId(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody()
                .getSubject();
    }

    /**
     * 验证 Token 是否有效
     */
    public boolean isTokenValid(String token, User user) {
        String userId = extractUserId(token);
        return userId.equals(user.getId()) && !isTokenExpired(token);
    }

    private boolean isTokenExpired(String token) {
        Date expiration = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody()
                .getExpiration();
        return expiration.before(new Date());
    }
}
```

---

## 八、项目结构总览

```
src/main/java/com/game/cs/
├── config/                     # 配置类
│   ├── SecurityConfig.java
│   ├── WebSocketConfig.java
│   ├── RedisConfig.java
│   └── SwaggerConfig.java
│
├── controller/                 # 控制器
│   ├── AuthController.java
│   ├── TicketController.java
│   ├── SessionController.java
│   ├── MessageController.java
│   ├── GameController.java
│   ├── UserController.java
│   └── DashboardController.java
│
├── service/                    # 服务层
│   ├── TicketService.java
│   ├── SessionService.java
│   ├── MessageService.java
│   ├── QueueService.java
│   ├── DifyService.java
│   ├── UserService.java
│   ├── JwtService.java
│   └── IssueTypeService.java
│
├── websocket/                  # WebSocket
│   ├── WebSocketController.java
│   ├── WebSocketService.java
│   └── WebSocketEventListener.java
│
├── entity/                     # 实体类
│   ├── Game.java
│   ├── Ticket.java
│   ├── Session.java
│   ├── Message.java
│   └── User.java
│
├── mapper/                     # MyBatis Mapper
│   ├── GameMapper.java
│   ├── TicketMapper.java
│   ├── SessionMapper.java
│   ├── MessageMapper.java
│   └── UserMapper.java
│
├── dto/                        # 数据传输对象
│   ├── request/
│   │   ├── CreateTicketDTO.java
│   │   ├── SendMessageDTO.java
│   │   └── ...
│   └── response/
│       ├── TicketDetailResponse.java
│       ├── SessionDetailResponse.java
│       └── ...
│
├── enums/                      # 枚举
│   ├── TicketStatus.java
│   ├── SessionStatus.java
│   ├── SenderType.java
│   └── UserRole.java
│
├── security/                   # 安全相关
│   └── JwtAuthenticationFilter.java
│
├── exception/                  # 异常处理
│   ├── NotFoundException.java
│   ├── BusinessException.java
│   ├── DifyException.java
│   └── GlobalExceptionHandler.java
│
└── util/                       # 工具类
    └── EncryptionUtil.java
```

---

## 九、面试重点总结

### 核心技术点

| 模块 | 技术 | 面试关键词 |
|------|------|-----------|
| Web 框架 | Spring Boot | 依赖注入、AOP、自动配置 |
| 实时通信 | WebSocket + STOMP | 全双工、消息代理、订阅发布 |
| 排队队列 | Redis Sorted Set | 有序集合、优先级排序、原子操作 |
| 认证 | Spring Security + JWT | 无状态认证、过滤器链 |
| ORM | MyBatis-Plus | 单表 CRUD、动态 SQL |
| AI 集成 | RestTemplate + Dify | API 调用、对话上下文 |

### 设计亮点

1. **会话状态机**：PENDING → QUEUED → IN_PROGRESS → CLOSED
2. **优先级排队**：Redis Sorted Set 实现动态优先级
3. **房间机制**：WebSocket 订阅实现会话隔离
4. **无登录设计**：玩家通过 Token 访问，降低使用门槛
5. **AI 兜底**：无客服在线时转加急工单

---

学习完这份文档后，你应该能够：
1. 用 Java 术语描述系统设计
2. 回答 WebSocket、Redis 队列、JWT 相关问题
3. 在面试中自信地讨论技术细节
