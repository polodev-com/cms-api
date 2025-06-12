import fetch from "node-fetch";


const AUTH_API_BASE_URL = process.env.AUTH_API_DOMAIN

if (!AUTH_API_BASE_URL) {
    throw "AUTH_API_BASE_URL not found in configuration"
}
export default {
    validateToken: async function (token) {
        if (!token) throw new Error("Missing token")
        return await fetch(AUTH_API_BASE_URL + '/api/auth/validateToken', {
            headers: {
                authorization: `Bearer ${token}`
            }
        }).then(response => {
            if (!response.ok) {
                throw new Error("Unauthorized");
            }
            return response.json()
        })
    }
}
