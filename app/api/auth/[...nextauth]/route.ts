import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { dbConnection } from "@/lib/db";
import bcrypt from "bcryptjs";

// Provider OIDC nội bộ
const oidcProvider = {
  id: "oidc",
  name: process.env.OIDC_PROVIDER_NAME || "Company SSO",
  type: "oauth" as const,
  wellKnown: process.env.OIDC_WELL_KNOWN,
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  authorization: { params: { scope: "openid email profile" } },
  idToken: true,
  checks: ["pkce", "state"] as ("pkce" | "state")[],
  profile(profile: { sub: string; name: string; email: string; picture?: string }) {
    return {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
      image: profile.picture,
    };
  },
};

// 1. Đưa cấu hình vào biến authOptions và export nó
export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/auth/signin",
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
        await dbConnection.initTables();
        
        // Credentials.username serves as Email in the UI
        const email = credentials.username;
        const password = credentials.password;

        const dbUser = await dbConnection.users.findByEmail(email);
        if (dbUser && dbUser.password_hash) {
          const isMatch = await bcrypt.compare(password, dbUser.password_hash);
          if (isMatch) {
            return {
              id: dbUser.id,
              name: dbUser.user_name,
              email: dbUser.email,
              image: dbUser.avatar,
              role: dbUser.role,
              is_banned: dbUser.is_banned
            };
          }
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, profile, user }) {
      await dbConnection.initTables();
      
      if (profile) {
        let dbUser = await dbConnection.users.findByEmail(profile.email!);
        if (!dbUser) {
          dbUser = await dbConnection.users.create({
            id: profile.sub!,
            name: profile.name!,
            email: profile.email!,
            avatar: (profile as any).picture
          });
        }
        token.userId = dbUser.id;
        token.userName = dbUser.user_name || dbUser.name;
        token.email = dbUser.email;
        token.avatar = dbUser.avatar;
        token.role = dbUser.role || 'guest';
        token.is_banned = dbUser.is_banned;
      } else if (user) {
        token.userId = user.id;
        token.userName = user.name;
        token.email = user.email;
        token.avatar = user.image;
        token.role = (user as any).role;
        token.is_banned = (user as any).is_banned;
      } else if (token.userId) {
        // Reload role dynamically from DB on page refresh (F5)
        const dbUser = await dbConnection.users.findById(token.userId as string);
        if (dbUser) {
          token.role = dbUser.role || 'guest';
          token.is_banned = dbUser.is_banned;
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
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };