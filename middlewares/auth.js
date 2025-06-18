import fetch from "node-fetch";
import {globalCache} from "../libs/cache.js";
import authApiService from "../services/authApiService.js";

/**
 * @description Can be used inside a controller to get the user authentication information
 * @param req
 * @param res
 * @returns {Promise<unknown>}
 */
export const validateUserJWTToken = async (req, res) => {
    const {authorization: authHeader} = req.headers;
    if (!authHeader) {
        throw new Error("Missing JWT token in the header.")
    }
    const [tokenType, jwtToken] = authHeader.split(" ")
    if (tokenType !== "Bearer") {
        throw new Error("Invalid auth token type")
    }
    if (!jwtToken) {
        throw new Error("Missing JWT token in the header")
    }
    let userData = globalCache.get(jwtToken);

    if (userData) return userData;

    userData = await authApiService.validateToken(jwtToken)
    if (!userData.valid) new Error("Invalid user.")
    globalCache.set(jwtToken, userData)
    req.auth = userData
    return userData;
}

/**
 * @description Middleware used for authenticate user
 * @param {string} [requiredRole] - Optional, only allow this role to access the route
 * @returns {Promise<*>}
 */
export const validateUserJWTTokenMiddleware = (requiredRole = null) => async (req, res, next) => {
    try {
        const {authorization: authHeader} = req.headers;
        if (!authHeader) {
            throw new Error("Missing JWT token in the header.")
        }
        const [tokenType, jwtToken] = authHeader.split(" ")
        if (tokenType !== "Bearer") {
            throw new Error("Invalid auth token type")
        }
        if (!jwtToken) {
            throw new Error("Missing JWT token in the header")
        }
        // Try to get the user information from the cache first
        let userData = globalCache.get(jwtToken);
        if (userData) {
            if (!userData.valid) {
                throw new Error("Invalid user.")
            }
            if (requiredRole && userData.user.role !== requiredRole) {
                return res.status(403).json({message: `Must be ${requiredRole} to access this route.`});
            }
            req.auth = userData;
            next();
        }
        // If the user not found in the cache, try to validate via auth service
        userData = await authApiService.validateToken(jwtToken)
        if (!userData.valid) new Error("Invalid user.")
        globalCache.set(jwtToken, userData, Math.round((Date.now() / 1000)) - userData.user.exp);
        req.auth = userData;
        next();
    } catch (error) {
        return res.status(401).json({message: error?.message});
    }
};
