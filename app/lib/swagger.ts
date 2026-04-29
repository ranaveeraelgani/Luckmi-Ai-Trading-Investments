import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Luckmi AI API",
      version: "1.0.0",
      description: "AI-powered trading platform APIs",
    },
    servers: [
      {
        url:
          process.env.NEXT_PUBLIC_BASE_URL ||
          "http://localhost:3000",
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },

      schemas: {
        PortfolioPosition: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            shares: { type: "number" },
            avgPrice: { type: "number" },
            currentPrice: { type: "number", nullable: true },
            pnl: { type: "number", nullable: true },
          },
        },

        AutoPosition: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            shares: { type: "number" },
            entryPrice: { type: "number" },
            currentPrice: { type: "number", nullable: true },
            pnl: { type: "number", nullable: true },
            allocation: { type: "number" },
            status: { type: "string" },
          },
        },

        BrokerMode: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["paper", "live"],
            },
          },
        },

        CronRun: {
          type: "object",
          properties: {
            job_name: { type: "string" },
            status: { type: "string" },
            users_processed: { type: "number" },
            trades_executed: { type: "number" },
            started_at: { type: "string" },
          },
        },
      },
    },

    security: [{ bearerAuth: [] }],

    tags: [
      { name: "Portfolio" },
      { name: "Auto Trading" },
      { name: "Broker" },
      { name: "Cron" },
      { name: "Admin" },
    ],
  },

  apis: ["./app/api/**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);