"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const response_1 = require("../utils/response");
const validate = (schema, source = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[source], {
            abortEarly: false,
            stripUnknown: true,
        });
        if (error) {
            const errors = error.details.map((d) => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 422, errors);
        }
        req[source] = value;
        return next();
    };
};
exports.validate = validate;
