const Recipe = require("../models/recipe");
const GrocerySections = require("../models/grocerySections");
const axios = require("axios");
const { uploadFile, emptyS3ImageDirectory } = require("../controlers/S3/recipe/index");

// @desc Get all recipes
// @route GET /api/recipes
// @access Private
exports.getRecipes = async (req, res, next) => {
    try {
        const recipes = await Recipe.find({ userId: req.user._id });
        return res.status(200).json({
            success: true,
            count: recipes.length,
            data: recipes,
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};
// @desc Post new recipe
// @route POST /api/recipes
// @access Private
// req.body = {name, servings, URL} no ingredients on create
exports.addRecipe = async (req, res, next) => {
    try {
        req.body.userId = req.user._id;
        let recipeObj = req.body;
        let scraperResult;
        if (req.body.URL) {
            let scraperRes = await axios.post(process.env.SCAPER_ENDPOINT + "/api/v1/scraper/fullRecipe", {
                url: req.body.URL,
            });
            if (!scraperRes.data.error) {
                scraperResult = "success";
                recipeObj = await buildFullRecipe(req.body.name, req.body.servings, req.body.userId, req.body.mealType, scraperRes.data);
            } else {
                scraperResult = scraperRes.data.error;
            }
        }
        const recipe = await Recipe.create(recipeObj);
        return res.status(201).json({
            success: true,
            scraper: scraperResult,
            data: recipe,
        });
    } catch (err) {
        console.log(`${err}`.red);
        if (err.name === "ValidationError") {
            const messages = Object.values(err.errors).map((val) => val.message);
            return res.status(400).json({
                success: false,
                error: messages,
            });
        } else {
            return res.status(500).json({
                success: false,
                error: "Server Error",
            });
        }
    }
};

// @desc Recipes created from the individualist webscraper
// @route POST /api/recipes/addFull
// @access Private
// req.body = {name, servings, URL, ingredients[]} no ingredients on create
exports.addFullRecipe = async (req, res, next) => {
    try {
        recipeObj = await buildFullRecipe(
            req.body.name ? req.body.name : "Name Me!",
            req.body.servings ? req.body.servings : 1,
            req.user._id,
            req.body.mealType,
            scraperRes.data
        );
        const recipe = await Recipe.create(recipeObj);
        return res.status(201).json({
            success: true,
            data: recipe,
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// Helper function for add recipe and add full recipe
buildFullRecipe = async (recipeName, recipeServings, userId, recipeMealType, data) => {
    //Expecptions cought in parrent function
    const ingredientsObj = [];
    const userSections = await GrocerySections.findOne({ userId: userId });
    data.ingredients.forEach((ingredient) => {
        ingredientsObj.push({ name: ingredient, grocerySection: userSections["default"] });
    });
    const recipeDetails = {
        Instructions: data.instructions,
        images: data.URL.length > 0 ? [{ original: data.image, thumbnail: data.image }] : [],
    };
    const recipeObj = {
        userId: userId,
        name: recipeName,
        servings: recipeServings,
        URL: data.URL ? data.URL : "http://",
        mealType: recipeMealType,
        ingredients: ingredientsObj,
        recipeDetails: recipeDetails,
    };

    return recipeObj;
};

// @desc Delete recipe for given _id
// @route DELETE /api/recipes:id
// @access Private
exports.deleteRecipe = async (req, res, next) => {
    const userId = req.user._id;
    const recipeId = req.body._id;
    try {
        const recipe = await Recipe.findOne({ _id: recipeId, userId: userId });
        if (!recipe) {
            return res.status(404).json({
                success: false,
                error: "No recipe found",
            });
        }
        const deleteImageRes = await emptyS3ImageDirectory(userId, recipeId);
        if (!deleteImageRes.success) {
            return res.status(500).json({
                success: false,
                error: deleteImageRes.error,
            });
        }
        await recipe.remove();

        return res.status(200).json({
            success: true,
            data: {},
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Delete recipe ingredient
// @route DELETE /api/recipes/:recipe_id/:ingredient_id
// @access Private
exports.deleteRecipeIngredient = async (req, res, next) => {
    try {
        await Recipe.updateOne({ _id: req.body.recipeId, userId: req.user._id }, { $pull: { ingredients: { _id: req.body.ingredientId } } });
        return res.status(200).json({
            success: true,
            data: {},
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Add recipe ingredient
// @route POST /api/:_id
// @access Private
exports.addRecipeIngredient = async (req, res, next) => {
    const recipeId = req.body.recipeId;
    try {
        const recipe = await Recipe.findOne({ _id: recipeId, userId: req.user._id });

        if (!recipe) {
            return res.status(404).json({
                success: false,
                error: "No recipe found",
            });
        }
        ingredient = req.body.ingredient;
        await Recipe.updateOne({ _id: recipeId, userId: req.user._id }, { $push: { ingredients: ingredient } });

        return res.status(200).json({
            success: true,
            data: {
                ingredient: ingredient,
                recipe: recipeId,
            },
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Edit recipe
// @route POST /api/recipes/edit
// @access Private
exports.saveEditedRecipe = async (req, res, next) => {
    try {
        await Recipe.replaceOne({ _id: req.body._id, userId: req.user._id }, req.body, { upsert: true });

        return res.status(200).json({
            success: true,
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Edit recipe
// @route POST /api/recipes/edit
// @access Private
exports.rate = async (req, res, next) => {
    try {
        const { _id, rating } = req.body;
        await Recipe.updateOne({ _id: _id, userId: req.user._id }, { $set: { rating: rating } });
        return res.status(200).json({
            success: true,
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Upload recipe image
// @route POST /api/recipes/details/uploadImage
// @access Private
exports.uploadRecipeImage = async (req, res, next) => {
    try {
        const acceptedFileTypes = { ".jpe": true, ".jpg": true, ".jpeg": true, ".png": true, ".ico": true };
        const {
            file,
            body: { name },
            body: { recipeId },
        } = req;

        if (!(file.detectedFileExtension in acceptedFileTypes)) {
            return res.status(500).json({
                success: false,
                error: "Invalid file type: " + `${file.clientReportedFileExtension ? file.clientReportedFileExtension : "Unknown"}`,
            });
        }
        const uploadRes = await uploadFile(file.path, name, req.user._id, recipeId);
        if (!uploadRes.success) {
            res.status(500).json(uploadRes);
        }
        //Push url to recipe doc
        const newImage = { original: uploadRes.imageURL, thumbnail: uploadRes.imageURL };
        await Recipe.updateOne({ _id: recipeId, userId: req.user._id }, { $push: { "recipeDetails.images": { $each: [newImage], $position: 0 } } });
        return res.status(200).json(uploadRes);
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Edit recipe details times
// @route POST /api/recipes/detail/times
// @access Private
exports.updateRecipeDetailsTimes = async (req, res, next) => {
    try {
        const {
            _id,
            data: { cookTime },
            data: { prepTime },
            data: { dificulty },
            data: { servings },
        } = req.body;

        await Recipe.updateOne(
            { _id: _id, userId: req.user._id },
            { $set: { "recipeDetails.cookTime": cookTime, "recipeDetails.prepTime": prepTime, "recipeDetails.dificulty": dificulty, servings: servings } }
        );

        return res.status(200).json({
            success: true,
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Edit recipe details notes
// @route POST /api/recipes/detail/notes
// @access Private
exports.updateRecipeDetailsNotes = async (req, res, next) => {
    try {
        const { _id, notes } = req.body;
        await Recipe.updateOne({ _id: _id, userId: req.user._id }, { $set: { "recipeDetails.notes": notes } });
        return res.status(200).json({
            success: true,
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Edit recipe details instructions
// @route POST /api/recipes/detail/instructions
// @access Private
exports.updateRecipeDetailsInstructions = async (req, res, next) => {
    try {
        const { _id, instructions } = req.body;
        await Recipe.updateOne({ _id: _id, userId: req.user._id }, { $set: { "recipeDetails.Instructions": instructions } });
        return res.status(200).json({
            success: true,
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};

// @desc Edit recipe meal type
// @route POST /api/recipes/mealType
// @access Private
exports.updateRecipeMealType = async (req, res, next) => {
    try {
        const { recipeId, mealTypeName } = req.body;
        const result = await Recipe.updateOne({ _id: recipeId, userId: req.user._id }, { $set: { mealType: mealTypeName } });
        return res.status(200).json({
            success: true,
        });
    } catch (err) {
        console.log(`${err}`.red);
        return res.status(500).json({
            success: false,
            error: "Server Error",
        });
    }
};
