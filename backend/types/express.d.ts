/**
 * What middleware/auth puts on every request it lets through: the payload
 * authController signs into the JWT. Only routers that run `router.use(auth)`
 * read it, which is every router that reads `req.user`.
 */
export interface AuthUser {
  userId: number;
  email: string;
}

declare global {
  // Express declares Request inside this namespace; merging is the documented
  // way to add a property to it.
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}
