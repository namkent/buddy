import NextAuth, { NextAuthOptions } from "next-auth";

/**
 * Cấu hình authOptions tách riêng để dùng chung cho cả
 * Route Auth và getServerSession ở các API Route khác.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "internal-oidc", // ID này sẽ quyết định callback URL: /api/auth/callback/internal-oidc
      name: "Internal Service",
      type: "oauth",
      // URL cấu hình OIDC nội bộ (Thường là: https://sso.yourcompany.com/.well-known/openid-configuration)
      wellKnown: process.env.OIDC_WELL_KNOWN,
      authorization: { params: { scope: "openid email profile" } },
      idToken: true,
      checks: ["pkce", "state"],
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,

      /**
       * Bước này cực kỳ quan trọng: Map dữ liệu từ Provider nội bộ
       * về cấu trúc chuẩn mà bạn muốn.
       */
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name || profile.preferred_username,
          email: profile.email,
          image: profile.picture, // Trường ảnh mặc định của OIDC
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, profile }) {
      // Khi đăng nhập thành công, profile sẽ chứa dữ liệu từ hàm profile() ở trên
      if (profile) {
        token.userId = profile.id;
        token.userName = profile.name;
        token.email = profile.email;
        token.avatar = profile.image;
      }
      return token;
    },
    async session({ session, token }) {
      // Chuyển dữ liệu từ JWT vào Session trả về cho Client/API
      if (session.user) {
        (session.user as any).userId = token.userId;
        (session.user as any).userName = token.userName;
        (session.user as any).email = token.email;
        (session.user as any).avatar = token.avatar;
      }
      return session;
    },
  },
  // Sử dụng JWT để lưu trữ session (phù hợp với môi trường không có DB)
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin", // Tùy chỉnh trang login nếu cần
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };