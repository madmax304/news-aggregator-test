require('dotenv').config(); // Load environment variables

const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');
const fs = require('fs');
const util = require('util');

// Load environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID;

// Initialize OpenAI with the API key
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Function to fetch article details (URL, headline) and filter for valid articles
async function fetchArticleDetails() {
  console.log("Fetching article details..."); // Debug log
  try {
    const response = await axios.get(`https://newsapi.org/v2/top-headlines?sources=the-verge&apiKey=${NEWS_API_KEY}`, {
      timeout: 8000 // Timeout for NewsAPI request
    });
    
    // Log the NewsAPI response for debugging
    console.log("NewsAPI Response:", response.data);

    const validArticles = response.data.articles.filter(article => {
      return article.url && article.url.includes('theverge.com') && article.url !== 'https://www.theverge.com';
    });

    if (validArticles.length === 0) {
      throw new Error('No valid articles found.');
    }

    const randomIndex = Math.floor(Math.random() * validArticles.length);
    const article = validArticles[randomIndex];

    console.log("Selected article:", article); // Log the selected article
    return {
      url: article.url,
      headline: article.title,
      description: article.description,
    };
  } catch (error) {
    console.error('Error fetching article details:', error.message);
    throw new Error('Failed to fetch valid article details.');
  }
}

// Function to summarize the article using OpenAI
async function summarizeArticle(articleUrl) {
  console.log("Summarizing article from URL:", articleUrl); // Debug log
  try {
    const { data } = await axios.get(articleUrl, { timeout: 8000 }); // Add timeout for article fetching
    const $ = cheerio.load(data);
    const articleText = $('p').text().trim(); // Extracting article text

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: `Please summarize the following article in detail: ${articleText}` }
      ],
      max_tokens: 1000,
    });

    const summary = response.choices[0].message.content.trim();
    console.log("Generated summary:", summary); // Debug log
    return summary;
  } catch (error) {
    console.error('Error summarizing article:', error.message);
    throw new Error('Failed to summarize article.');
  }
}

// Function to convert the summary into speech using Eleven Labs TTS
async function convertSummaryToSpeech(summary) {
    console.log('Converting summary to speech:', summary);
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_LABS_VOICE_ID}`,  
        {
          text: summary,
          voice_settings: { stability: 1.0, similarity_boost: 1.0 }
        },
        {
          headers: {
            'xi-api-key': ELEVEN_LABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 8000  // 8-second timeout
        }
      );
      console.log('Eleven Labs API response:', response.status);
      const writeFile = util.promisify(fs.writeFile);
      await writeFile('output.mp3', response.data, 'binary');
      console.log('Audio content written to file: output.mp3');
      
      return 'output.mp3';  
    } catch (error) {
      console.error('Error from Eleven Labs API:', error.response ? error.response.data : error.message);
      throw new Error('Failed to convert summary to speech.');
    }
  }
// Function to generate quiz questions based on the article summary
async function generateQuizQuestions(summary) {
  console.log("Generating quiz questions..."); // Debug log
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Based on the following summary: "${summary}", please create 3 multiple-choice questions. Each question should have 4 answer options and indicate the correct answer.`
        }
      ],
      max_tokens: 500,
    });

    const quizQuestions = response.choices[0].message.content.trim();
    console.log("Generated quiz questions:", quizQuestions); // Debug log
    return quizQuestions;
  } catch (error) {
    console.error('Error generating quiz questions:', error.message);
    throw new Error('Failed to generate quiz questions.');
  }
}

// Handle the process-article request
module.exports = async (req, res) => {
  try {
    console.log('Received request to /process-article'); // Debug log
    const articleDetails = await fetchArticleDetails();
    const summary = await summarizeArticle(articleDetails.url);
    const audioFile = await convertSummaryToSpeech(summary);
    const quizQuestions = await generateQuizQuestions(summary);

    res.json({
      articleUrl: articleDetails.url,
      headline: articleDetails.headline,
      description: articleDetails.description,
      summary,
      audioFile,
      quizQuestions
    });
  } catch (error) {
    console.error('Error in /process-article:', error.message); // Log the error
    res.status(500).json({ error: error.message });
  }
};