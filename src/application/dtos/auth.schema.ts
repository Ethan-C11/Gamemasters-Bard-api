import { Type, Static } from "@fastify/type-provider-typebox";

export const SignUpBody = Type.Object({
    email: Type.String({ format: "email" }),
    username: Type.String({ minLength: 3 }),
    password: Type.String({ minLength: 8 }),
});
export type SignUpBody = Static<typeof SignUpBody>;

export const SignInBody = Type.Object({
    email: Type.String({ format: "email" }),
    password: Type.String(),
});
export type SignInBody = Static<typeof SignInBody>;

export const AuthResponse = Type.Object({
    token: Type.String(),
    user: Type.Object({
        id: Type.Number(),
        email: Type.String(),
        username: Type.String(),
    }),
});

export const ActivateBody = Type.Object({
    token: Type.String(),
    password: Type.String({minLength: 12}),
});
export type ActivateBody = Static<typeof ActivateBody>;

export const ActivateResponse = Type.Object({
    user: Type.Object({
        id: Type.Number(),
        email: Type.String(),
        username: Type.String(),
    }),
});