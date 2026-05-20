import express from 'express';
import { addFavorite, getFavorites, removeFavorite } from '../controllers/favoriteController.js';
import protect from '../middleware/authMiddleware.js';


const router = express.Router();

router.post('/', protect, addFavorite);
router.get('/', protect, getFavorites);
router.delete('/:id', protect, removeFavorite);

export default router;
