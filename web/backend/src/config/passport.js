const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const userModel = require('../models/userModel');

function configurePassport() {
  const clientID = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const callbackURL = process.env.GOOGLE_CALLBACK_URL?.trim();

  if (!clientID || !clientSecret || !callbackURL) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          if (!email) {
            return done(new Error('Google no devolvió email'));
          }
          const nombre = profile.name?.givenName || profile.displayName || 'Usuario';
          const apellido = profile.name?.familyName || null;
          const user = await userModel.upsertGoogleUser({
            googleId,
            email,
            nombre,
            apellido,
            pais: null,
          });
          // Pasar fila con id para la sesión Passport; serializeUser solo guarda user.id.
          return done(null, { id: user.id });
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await userModel.findById(id);
      done(null, user ? userModel.toPublicUser(user) : null);
    } catch (err) {
      done(err);
    }
  });
}

module.exports = { configurePassport };
