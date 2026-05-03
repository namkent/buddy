import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { dbConnection } from "@/lib/db";
import bcrypt from "bcryptjs";

// 1. Cấu hình OIDC Provider (Google-like for demo/local)
const oidcProvider = {
  id: "oidc",
  name: process.env.OIDC_PROVIDER_NAME || "OIDC Connect",
  type: "oauth" as const,
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  issuer: "https://accounts.google.com",
  authorization: {
    url: "https://accounts.google.com/o/oauth2/v2/auth",
    params: { scope: "openid email profile" },
  },
  token: "https://oauth2.googleapis.com/token",
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  idToken: true,
  client: {
    id_token_signed_response_alg: "RS256",
  },
  checks: ["pkce", "state"] as ("pkce" | "state")[],
  jwks_endpoint: "https://www.googleapis.com/oauth2/v3/certs",
  async profile(profile: any) {
    return {
      id: profile.sub,
      name: profile.name || profile.given_name || profile.sub,
      email: profile.email,
      image: profile.picture,
    };
  },
  httpOptions: { timeout: 10000 },
};

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: 1 * 24 * 60 * 60, // 1 day (24 hours)
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    oidcProvider,
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        
        const dbUser = await dbConnection.users.findByEmail(credentials.username);
        if (dbUser && dbUser.password_hash) {
          const isMatch = await bcrypt.compare(credentials.password, dbUser.password_hash);
          if (isMatch) {
            return {
              id: dbUser.id,
              name: dbUser.user_name || dbUser.name,
              email: dbUser.email,
              image: dbUser.avatar,
              role: dbUser.role,
              is_banned: dbUser.is_banned,
              lang: dbUser.lang
            };
          }
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, profile, user }) {
      if (profile && user) {
        let dbUser = await dbConnection.users.findByEmail(user.email!);
        if (!dbUser) {
          dbUser = await dbConnection.users.create({
            id: user.id,
            name: user.name || (profile as any).formattedName || (profile as any).sub,
            email: user.email!,
            avatar: user.image || (profile as any).picture
          });
        }
        token.userId = dbUser.id;
        token.userName = dbUser.user_name || dbUser.name;
        token.email = dbUser.email;
        token.avatar = dbUser.avatar;
        token.role = dbUser.role || 'guest';
        token.is_banned = dbUser.is_banned;
        token.lang = dbUser.lang || 'en';
      }
      else if (user) {
        token.userId = user.id;
        token.userName = user.name;
        token.email = user.email;
        token.avatar = user.image;
        token.role = (user as any).role;
        token.is_banned = (user as any).is_banned;
        token.lang = (user as any).lang || 'en';
      }
      else if (token.userId) {
        const dbUser = await dbConnection.users.findById(token.userId as string);
        if (dbUser) {
          token.role = dbUser.role || 'guest';
          token.is_banned = dbUser.is_banned;
          token.userName = dbUser.user_name || dbUser.name;
          token.lang = dbUser.lang || 'en';
        }
      }
      else if (token.email) {
        // Fallback tự phục hồi session cũ bị mất userId
        const dbUser = await dbConnection.users.findByEmail(token.email as string);
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role || 'guest';
          token.is_banned = dbUser.is_banned;
          token.userName = dbUser.user_name || dbUser.name;
          token.lang = dbUser.lang || 'en';
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).userId = token.userId;
        (session.user as any).userName = token.userName;
        (session.user as any).email = token.email;
        (session.user as any).avatar = token.avatar;
        (session.user as any).role = token.role;
        (session.user as any).is_banned = token.is_banned;
        (session.user as any).lang = token.lang;
      }
      return session;
    },
  },
};
