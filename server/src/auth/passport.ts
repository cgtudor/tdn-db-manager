import passport from 'passport';
import { Strategy as DiscordStrategy, Profile } from 'passport-discord';
import { config } from '../config';
import { upsertUser, getUser } from '../db/app-db';

// Fetch guild member roles via Discord REST API (no discord.js dependency needed)
async function getMemberRoles(userId: string): Promise<string[]> {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${config.discord.guildId}/members/${userId}`,
    { headers: { Authorization: `Bot ${config.discord.botToken}` } }
  );
  if (!res.ok) return [];
  const member = await res.json() as { roles: string[] };
  return member.roles || [];
}

export function setupPassport(): void {
  passport.use(new DiscordStrategy({
    clientID: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    callbackURL: config.discord.callbackUrl,
    scope: ['identify'],
  }, (_accessToken: string, _refreshToken: string, profile: Profile, done: (error: any, user?: Express.User | false) => void) => {
    (async () => {
    try {
      console.log(`OAuth callback for: ${profile.username} (${profile.id})`);
      // Check guild membership and required role
      const memberRoles = await getMemberRoles(profile.id);
      console.log(`Member roles: ${memberRoles.join(', ') || 'none'}`);

      if (memberRoles.length === 0) {
        console.log(`Login denied: ${profile.username} (${profile.id}) - not in guild`);
        return done(null, false);
      }

      const hasAllowedRole = config.discord.allowedRoleIds.length === 0 ||
        config.discord.allowedRoleIds.some(roleId => memberRoles.includes(roleId));

      if (!hasAllowedRole) {
        console.log(`Login denied: ${profile.username} (${profile.id}) - missing required role`);
        return done(null, false);
      }

      const avatarUrl = profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null;

      const appUser = upsertUser(profile.id, profile.username, avatarUrl);

      const user: Express.User = {
        id: appUser.discord_id,
        username: appUser.username,
        avatar: appUser.avatar_url,
        role: appUser.role,
      };

      return done(null, user);
    } catch (error) {
      console.error('Discord OAuth error:', error);
      return done(error as Error);
    }
    })().catch(err => done(err));
  }));

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((discordId: string, done) => {
    try {
      const appUser = getUser(discordId);
      if (!appUser) {
        return done(null, false);
      }

      const user: Express.User = {
        id: appUser.discord_id,
        username: appUser.username,
        avatar: appUser.avatar_url,
        role: appUser.role,
      };
      done(null, user);
    } catch (error) {
      console.error('Deserialize user error:', error);
      done(null, false);
    }
  });
}
