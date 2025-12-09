import {
  InferAttributes,
  InferCreationAttributes,
  Op,
} from "sequelize";
import {
  ForeignKey,
  BelongsTo,
  Column,
  Table,
  DataType,
  Default,
  CreatedAt,
  PrimaryKey,
  IsUUID,
  Length,
} from "sequelize-typescript";
import { AIProvider, AIOperationType } from "@shared/types";
import AIConversation from "@server/models/AIConversation";
import Team from "@server/models/Team";
import User from "@server/models/User";
import Model from "@server/models/base/Model";
import Fix from "@server/models/decorators/Fix";

@Table({
  tableName: "ai_usage",
  modelName: "ai_usage",
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ["teamId", "createdAt"] },
    { fields: ["userId", "createdAt"] },
    { fields: ["conversationId"] },
  ],
})
@Fix
class AIUsage extends Model<
  InferAttributes<AIUsage>,
  Partial<InferCreationAttributes<AIUsage>>
> {
  @IsUUID(4)
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @CreatedAt
  createdAt: Date;

  @Length({ max: 50 })
  @Column(DataType.STRING(50))
  provider: AIProvider;

  @Length({ max: 100 })
  @Column(DataType.STRING(100))
  model: string;

  @Default(0)
  @Column(DataType.INTEGER)
  inputTokens: number;

  @Default(0)
  @Column(DataType.INTEGER)
  outputTokens: number;

  @Length({ max: 50 })
  @Column(DataType.STRING(50))
  operationType: AIOperationType;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => User, "userId")
  user: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string;

  @BelongsTo(() => AIConversation, "conversationId")
  conversation: AIConversation | null;

  @ForeignKey(() => AIConversation)
  @Column(DataType.UUID)
  conversationId: string | null;

  // methods

  /**
   * Get the total tokens for this usage record.
   */
  getTotalTokens(): number {
    return this.inputTokens + this.outputTokens;
  }

  // static methods

  /**
   * Get usage stats for a team within a date range.
   */
  static async getTeamUsage(
    teamId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ inputTokens: number; outputTokens: number; totalRequests: number }> {
    const results = await this.findAll({
      where: {
        teamId,
        createdAt: {
          [Op.gte]: startDate,
          [Op.lte]: endDate,
        },
      },
      attributes: [
        [this.sequelize!.fn("SUM", this.sequelize!.col("inputTokens")), "totalInput"],
        [this.sequelize!.fn("SUM", this.sequelize!.col("outputTokens")), "totalOutput"],
        [this.sequelize!.fn("COUNT", this.sequelize!.col("id")), "count"],
      ],
      raw: true,
    });

    const result = results[0] as unknown as {
      totalInput: string | null;
      totalOutput: string | null;
      count: string;
    };

    return {
      inputTokens: parseInt(result.totalInput || "0", 10),
      outputTokens: parseInt(result.totalOutput || "0", 10),
      totalRequests: parseInt(result.count || "0", 10),
    };
  }

  /**
   * Get usage stats for a user within a date range.
   */
  static async getUserUsage(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ inputTokens: number; outputTokens: number; totalRequests: number }> {
    const results = await this.findAll({
      where: {
        userId,
        createdAt: {
          [Op.gte]: startDate,
          [Op.lte]: endDate,
        },
      },
      attributes: [
        [this.sequelize!.fn("SUM", this.sequelize!.col("inputTokens")), "totalInput"],
        [this.sequelize!.fn("SUM", this.sequelize!.col("outputTokens")), "totalOutput"],
        [this.sequelize!.fn("COUNT", this.sequelize!.col("id")), "count"],
      ],
      raw: true,
    });

    const result = results[0] as unknown as {
      totalInput: string | null;
      totalOutput: string | null;
      count: string;
    };

    return {
      inputTokens: parseInt(result.totalInput || "0", 10),
      outputTokens: parseInt(result.totalOutput || "0", 10),
      totalRequests: parseInt(result.count || "0", 10),
    };
  }

  /**
   * Check if a user has exceeded rate limits.
   */
  static async checkRateLimits(
    userId: string,
    teamId: string,
    limits: { requestsPerMinute: number; tokensPerDay: number; tokensPerMonth: number }
  ): Promise<{
    allowed: boolean;
    reason?: string;
    currentUsage?: {
      requestsLastMinute: number;
      tokensToday: number;
      tokensThisMonth: number;
    };
  }> {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Check requests per minute
    const requestsLastMinute = await this.count({
      where: {
        userId,
        createdAt: { [Op.gte]: oneMinuteAgo },
      },
    });

    if (requestsLastMinute >= limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: "Rate limit exceeded: too many requests per minute",
        currentUsage: {
          requestsLastMinute,
          tokensToday: 0,
          tokensThisMonth: 0,
        },
      };
    }

    // Check daily token limit
    const dailyUsage = await this.getTeamUsage(teamId, startOfDay, now);
    const tokensToday = dailyUsage.inputTokens + dailyUsage.outputTokens;

    if (tokensToday >= limits.tokensPerDay) {
      return {
        allowed: false,
        reason: "Daily token limit exceeded",
        currentUsage: {
          requestsLastMinute,
          tokensToday,
          tokensThisMonth: 0,
        },
      };
    }

    // Check monthly token limit
    const monthlyUsage = await this.getTeamUsage(teamId, startOfMonth, now);
    const tokensThisMonth = monthlyUsage.inputTokens + monthlyUsage.outputTokens;

    if (tokensThisMonth >= limits.tokensPerMonth) {
      return {
        allowed: false,
        reason: "Monthly token limit exceeded",
        currentUsage: {
          requestsLastMinute,
          tokensToday,
          tokensThisMonth,
        },
      };
    }

    return {
      allowed: true,
      currentUsage: {
        requestsLastMinute,
        tokensToday,
        tokensThisMonth,
      },
    };
  }
}

export default AIUsage;
