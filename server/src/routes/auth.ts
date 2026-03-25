import { Router } from 'express';
import passport from 'passport';
import { config } from '../config';

const router = Router();

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login?error=auth_failed' }),
  (_req, res) => {
    res.redirect('/');
  }
);

router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ success: true });
  });
});

router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user!.id,
        username: req.user!.username,
        avatar: req.user!.avatar,
        role: req.user!.role,
      },
    });
  } else {
    res.json({ authenticated: false, user: null });
  }
});

export default router;
