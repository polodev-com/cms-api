import express from "express";

const articleRoute = express.Router();
import articleController from "../controllers/articles.controller.js";
import {validateUserJWTTokenMiddleware} from "../middlewares/auth.js";

// Create article
articleRoute.post("/create", validateUserJWTTokenMiddleware("admin"), articleController.createArticle);

// Upload article
articleRoute.post(
    "/:articleId/upload",
    validateUserJWTTokenMiddleware("admin"),
    articleController.uploadArticleContent
);

// Get recent articles
articleRoute.get("/", articleController.getArticleList);

// Get article statistic
articleRoute.get("/statistics", articleController.getArticleStatistics);

// Get a specific article
articleRoute.get("/:articleId", articleController.getArticleById);

// Update an article
articleRoute.patch(
    "/:articleId/update",
    validateUserJWTTokenMiddleware("admin"),
    articleController.updateArticleById
);

// Delete an article
articleRoute.delete(
    "/:articleId",
    validateUserJWTTokenMiddleware("admin"),
    articleController.deleteArticle
);

articleRoute.post('/clear-cache', validateUserJWTTokenMiddleware("admin"), articleController.clearArticleCache);

export default articleRoute;
