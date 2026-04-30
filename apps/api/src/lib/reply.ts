import type { FastifyReply } from "fastify";

type Meta = Record<string, unknown>;

export function sendData<T>(reply: FastifyReply, data: T, meta?: Meta) {
  return reply.send({
    data,
    ...(meta ? { meta } : {})
  });
}

export function sendCreated<T>(reply: FastifyReply, data: T) {
  return reply.code(201).send({ data });
}

export function sendNoContent(reply: FastifyReply) {
  return reply.code(204).send();
}
