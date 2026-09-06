"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const validate_middleware_1 = require("../../../middlewares/validate.middleware");
const auth_validators_1 = require("../validators/auth.validators");
const router = (0, express_1.Router)();
// Passwordless: one endpoint to ask for a code, one to spend it. The second
// creates the account when the address is new, so there is no separate
// registration call and no half-made account when someone walks away.
router.post('/otp/request', (0, validate_middleware_1.validate)(auth_validators_1.requestOtpSchema), auth_controller_1.authController.requestOtp.bind(auth_controller_1.authController));
router.post('/otp/verify', (0, validate_middleware_1.validate)(auth_validators_1.verifyOtpSchema), auth_controller_1.authController.verifyOtp.bind(auth_controller_1.authController));
// Password sign-in stays for accounts that have one. The only admin is
// admin@uniquedressup.com and the domain has no MX records, so a code sent
// there would bounce — removing this would lock the shop out of its own panel.
router.post('/login', (0, validate_middleware_1.validate)(auth_validators_1.loginSchema), auth_controller_1.authController.login.bind(auth_controller_1.authController));
router.post('/google', (0, validate_middleware_1.validate)(auth_validators_1.googleAuthSchema), auth_controller_1.authController.googleAuth.bind(auth_controller_1.authController));
router.post('/refresh', (0, validate_middleware_1.validate)(auth_validators_1.refreshTokenSchema), auth_controller_1.authController.refresh.bind(auth_controller_1.authController));
router.post('/logout', auth_middleware_1.authenticate, auth_controller_1.authController.logout.bind(auth_controller_1.authController));
router.post('/forgot-password', (0, validate_middleware_1.validate)(auth_validators_1.forgotPasswordSchema), auth_controller_1.authController.forgotPassword.bind(auth_controller_1.authController));
router.post('/reset-password', (0, validate_middleware_1.validate)(auth_validators_1.resetPasswordSchema), auth_controller_1.authController.resetPassword.bind(auth_controller_1.authController));
router.put('/change-password', auth_middleware_1.authenticate, (0, validate_middleware_1.validate)(auth_validators_1.changePasswordSchema), auth_controller_1.authController.changePassword.bind(auth_controller_1.authController));
router.get('/me', auth_middleware_1.authenticate, auth_controller_1.authController.me.bind(auth_controller_1.authController));
exports.default = router;
