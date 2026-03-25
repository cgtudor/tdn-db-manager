import passport from 'passport';
import { Strategy as DiscordStrategy, Profile } from 'passport-discord';
import { config } from '../config';
import { upsertUser, getUser } from '../db/app-db';

export function setupPassport(): void {
  passport.use(new DiscordStrategy({
    clientID: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    callbackURL: config.discord.callbackUrl,
    scope: ['identify'],
  }, (_accessToken: string, _refreshToken: string, profile: Profile, done: (error: any, user?: Express.User | false) => void) => {
    try {
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
