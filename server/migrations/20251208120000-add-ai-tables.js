"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // AI Configurations table - stores team-level AI settings
    await queryInterface.createTable("ai_configs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      teamId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "teams", key: "id" },
        onDelete: "CASCADE",
        unique: true,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      providers: {
        type: Sequelize.BLOB,
        allowNull: true,
        comment: "Encrypted JSON containing provider API keys",
      },
      defaultModels: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Default model per provider",
      },
      availableModels: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Whitelist of models users can select",
      },
      permissions: {
        type: Sequelize.JSONB,
        defaultValue: {
          enabledFor: "admins",
          features: { chat: true, editing: true, generation: true },
        },
        allowNull: false,
      },
      rateLimits: {
        type: Sequelize.JSONB,
        defaultValue: {
          requestsPerMinute: 20,
          tokensPerDay: 100000,
          tokensPerMonth: 2000000,
        },
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // AI Conversations table - stores chat history
    await queryInterface.createTable("ai_conversations", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      teamId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "teams", key: "id" },
        onDelete: "CASCADE",
      },
      documentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "documents", key: "id" },
        onDelete: "SET NULL",
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "chat",
      },
      messages: {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      lastMessageAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("ai_conversations", ["userId", "teamId"]);
    await queryInterface.addIndex("ai_conversations", ["documentId"]);
    await queryInterface.addIndex("ai_conversations", ["teamId", "createdAt"]);

    // AI Usage table - tracks token usage for rate limiting and billing
    await queryInterface.createTable("ai_usage", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      teamId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "teams", key: "id" },
        onDelete: "CASCADE",
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      conversationId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "ai_conversations", key: "id" },
        onDelete: "SET NULL",
      },
      provider: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      model: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      inputTokens: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      outputTokens: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      operationType: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("ai_usage", ["teamId", "createdAt"]);
    await queryInterface.addIndex("ai_usage", ["userId", "createdAt"]);
    await queryInterface.addIndex("ai_usage", ["conversationId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ai_usage");
    await queryInterface.dropTable("ai_conversations");
    await queryInterface.dropTable("ai_configs");
  },
};
