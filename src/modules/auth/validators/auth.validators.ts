import Joi from 'joi';

export const registerSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).max(100).required(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).optional(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

export const googleAuthSchema = Joi.object({
  token: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).max(100).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(100).required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});
