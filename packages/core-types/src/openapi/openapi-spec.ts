/**
 * OpenAPI 3.1 Specification Generator & Interactive Swagger UI Renderer
 * Provides complete machine-readable API specifications and interactive B2B developer documentation.
 */

export interface OpenApiEndpoint {
  path: string;
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  summary: string;
  description?: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{
    name: string;
    in: 'query' | 'path' | 'header';
    required?: boolean;
    schema: { type: string; format?: string; default?: any };
    description?: string;
  }>;
  requestBody?: {
    required?: boolean;
    content: {
      'application/json': {
        schema: Record<string, any>;
      };
    };
  };
  responses: Record<
    string,
    {
      description: string;
      content?: {
        'application/json': {
          schema: Record<string, any>;
        };
      };
    }
  >;
}

export class OpenApiSpecBuilder {
  public static generateSpec(): Record<string, any> {
    return {
      openapi: '3.1.0',
      info: {
        title: 'XBET Platform Enterprise API',
        version: '2.0.0',
        description:
          'High-performance Next-Generation Sportsbook, In-Play Trading, Casino, and Double-Entry Wallet Platform API.',
        contact: {
          name: 'Engineering Architecture Team',
          email: 'api-support@xbet.local',
        },
      },
      servers: [
        { url: 'https://api.xbet.local', description: 'Production API Gateway' },
        { url: 'http://localhost:8080', description: 'Local Staging Environment' },
      ],
      tags: [
        { name: 'Sportsbook', description: 'Prematch & In-Play event fixtures, odds, and bet slip placement' },
        { name: 'Casino', description: 'RNG certified casino table games, slots, and multiplayer poker' },
        { name: 'Wallet & Ledger', description: 'Double-entry balance, deposits, withdrawals, and escrow holds' },
        { name: 'Admin & Trading', description: 'Risk exposure scanners, margin managers, and fixture settlement' },
        { name: 'Compliance', description: 'GLI-19 RNG audits, reality checks, and responsible gaming' },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Provide JWT token generated from /api/v1/auth/login',
          },
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'B2B White-Label Merchant API Key',
          },
        },
        schemas: {
          ErrorResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: { type: 'string', example: 'RESOURCE_NOT_FOUND' },
              message: { type: 'string', example: 'The requested fixture or ticket does not exist' },
            },
            required: ['success', 'error'],
          },
        },
      },
      paths: {
        '/api/v1/auth/login': {
          post: {
            tags: ['Auth'],
            summary: 'Authenticate User / Cashier',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      username: { type: 'string', example: 'player1' },
                      password: { type: 'string', example: 'Password123!' },
                    },
                    required: ['username', 'password'],
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Authentication successful',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        token: { type: 'string' },
                        user: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/api/v1/sports/fixtures': {
          get: {
            tags: ['Sportsbook'],
            summary: 'List In-Play & Prematch Sports Fixtures',
            parameters: [
              { name: 'sport', in: 'query', schema: { type: 'string' }, description: 'Filter by sport slug (soccer, basketball)' },
              { name: 'liveOnly', in: 'query', schema: { type: 'boolean', default: false }, description: 'Filter only live in-play matches' },
            ],
            responses: {
              '200': {
                description: 'List of active fixtures with current odds markets',
              },
            },
          },
        },
        '/api/v1/tickets/place': {
          post: {
            tags: ['Sportsbook'],
            summary: 'Place Bet Slip (Single / Combi / System)',
            security: [{ BearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['SINGLE', 'COMBI', 'SYSTEM'], example: 'COMBI' },
                      stake: { type: 'number', example: 50.0 },
                      legs: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            eventId: { type: 'string', example: 'fix-101' },
                            marketKey: { type: 'string', example: '1X2' },
                            selection: { type: 'string', example: '1' },
                            expectedOdd: { type: 'number', example: 1.85 },
                          },
                        },
                      },
                    },
                    required: ['type', 'stake', 'legs'],
                  },
                },
              },
            },
            responses: {
              '201': {
                description: 'Bet placed successfully with escrow lock',
              },
            },
          },
        },
        '/api/v1/tickets/{id}/cashout': {
          post: {
            tags: ['Sportsbook'],
            summary: 'Execute Full or Partial Cash-Out',
            security: [{ BearerAuth: [] }],
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      cashoutPercent: { type: 'number', minimum: 1, maximum: 100, example: 50 },
                    },
                    required: ['cashoutPercent'],
                  },
                },
              },
            },
            responses: {
              '200': { description: 'Cashout settled and wallet balance credited' },
            },
          },
        },
        '/api/v1/casino/games': {
          get: {
            tags: ['Casino'],
            summary: 'List Available HTML5 Casino Games',
            responses: {
              '200': { description: 'Catalog of roulette, blackjack, slots, and scratch cards' },
            },
          },
        },
        '/api/v1/casino/roulette/spin': {
          post: {
            tags: ['Casino'],
            summary: 'Play European Roulette Round',
            security: [{ BearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      bets: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            type: { type: 'string', example: 'STRAIGHT_UP' },
                            value: { type: 'number', example: 17 },
                            amount: { type: 'number', example: 10 },
                          },
                        },
                      },
                    },
                    required: ['bets'],
                  },
                },
              },
            },
            responses: {
              '200': { description: 'Spin result, winning number, and total payout' },
            },
          },
        },
        '/api/v1/wallet/balance': {
          get: {
            tags: ['Wallet & Ledger'],
            summary: 'Get Player Available and Escrow Balances',
            security: [{ BearerAuth: [] }],
            responses: {
              '200': { description: 'Real-time double-entry ledger balance summary' },
            },
          },
        },
        '/api/v1/compliance/reality-check': {
          get: {
            tags: ['Compliance'],
            summary: 'Check Responsible Gaming Reality Check Status',
            security: [{ BearerAuth: [] }],
            responses: {
              '200': { description: 'Active session duration, total wagered, and cooling-off limits' },
            },
          },
        },
      },
    };
  }

  /**
   * Generates interactive standalone Swagger UI HTML page
   */
  public static generateSwaggerHtml(specUrl: string = '/api/docs/openapi.json', title: string = 'XBET API Documentation'): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; background: #121212; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .topbar { display: none !important; }
    .swagger-ui { color: #f0f0f0; max-width: 1200px; margin: 0 auto; padding: 24px; }
    .swagger-ui .info .title { color: #00805c !important; font-size: 2.2rem; font-weight: 800; }
    .swagger-ui .scheme-container { background: #1a1a1a !important; border-radius: 8px; border: 1px solid #333; }
    .swagger-ui .opblock { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .swagger-ui .opblock .opblock-summary-method { border-radius: 4px; font-weight: bold; }
    .swagger-ui .btn.authorize { background: #00805c; color: #fff; border-color: #00805c; }
    .swagger-ui select { background: #222; color: #fff; border: 1px solid #444; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
  }
}
