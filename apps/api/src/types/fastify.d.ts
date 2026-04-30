import "@fastify/jwt";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      userId: string;
      email: string;
    };
    rawBody?: Buffer;
  }
}
