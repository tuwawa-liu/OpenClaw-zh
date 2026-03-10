import { Type, type Static } from "@sinclair/typebox";

const CHAT_ACTION_VALUES = ["members", "info"] as const;
const MEMBER_ID_TYPE_VALUES = ["open_id", "user_id", "union_id"] as const;

export const FeishuChatSchema = Type.Object({
  action: Type.Unsafe<(typeof CHAT_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...CHAT_ACTION_VALUES],
    description: "要执行的操作：members | info",
  }),
  chat_id: Type.String({ description: "群聊 ID（从 URL 或事件负载获取）" }),
  page_size: Type.Optional(Type.Number({ description: "分页大小（1-100，默认 50）" })),
  page_token: Type.Optional(Type.String({ description: "分页令牌" })),
  member_id_type: Type.Optional(
    Type.Unsafe<(typeof MEMBER_ID_TYPE_VALUES)[number]>({
      type: "string",
      enum: [...MEMBER_ID_TYPE_VALUES],
      description: "成员 ID 类型（默认：open_id）",
    }),
  ),
});

export type FeishuChatParams = Static<typeof FeishuChatSchema>;
