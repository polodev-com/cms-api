import fetch from "node-fetch";
import {globalCache} from "../libs/cache.js";
import authApiService from "../services/authApiService.js";

export const validateUserJWTToken = async (req, res, next) => {
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
            console.log("Get user data from the cache", userData);
            req.auth = userData;
            next();
        }
        // If the user not found in the cache, try to validate via auth service
        userData = await authApiService.validateToken(jwtToken)
        if (!userData.valid) new Error("Invalid user.")
        globalCache.set(jwtToken, userData, Math.round((Date.now() / 1000)) - userData.user.exp);
        console.log("User data saved to the cache");
        req.auth = userData;
        next();
    } catch (error) {
        return res.status(401).json({message: error?.message});
    }
};
