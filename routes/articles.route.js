import express from "express";

const articleRoute = express.Router();
import articleController from "../controllers/articleControler.js";
import {validateUserJWTTokenMiddleware} from "../middlewares/auth.js";

// Create article
articleRoute.post("/create", validateUserJWTTokenMiddleware, articleController.createArticle);

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
    validateUserJWTTokenMiddleware,
    articleController.updateArticleById
);

// Delete an article
articleRoute.delete(
    "/:articleId",
    validateUserJWTTokenMiddleware,
    articleController.deleteArticle
);

export default articleRoute;
