const express = require("express");
const fetch = require("node-fetch");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

const app = express();
const PORT = 5000;

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());


cloudinary.config({
  cloud_name: "dn3vbnvcs",
  api_key: "665849725345148",
  api_secret: "RrBEvJok6yFsVZaJSc2z1tBUWpk",
});



const uploadFileFromStream = async (responseStream) => {
  return new Promise((resolve, reject) => {
    const cloudStream = cloudinary.uploader.upload_stream(
      { resource_type: "auto" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    responseStream.pipe(cloudStream);
  });
};

const downloadAndUpload = async (url) => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to download file: ${response.status}`);

  return await uploadFileFromStream(response.body);
};

app.get("/", (req, res) => {
  return res.send("hello world");
});

const generateNotes = async (videoTranscript) => {
  try {
    const prompt = `
You are an expert academic assistant trained to convert educational content into structured, easy-to-understand notes **specifically for students preparing for exams or interviews**.

Your task is to convert the following video transcript into an array of JSON objects. Each object must include:

- **title**: Main subject area.
- **subtitle**: Specific subtopic or concept.
- **description**: Array of bullet points with detailed and clear explanations in simple language. Include:
  - Definitions with clarity.
  - Real-world analogies or examples where helpful.
  - Important terms in **bold** or *italic* (use Markdown).
  - Simple explanations of technical terms.
  - Step-by-step logic or breakdowns if applicable.

### Output Format:
\`\`\`json
[
  {
    "title": "Main Topic",
    "subtitle": "Subtopic",
    "description": [
      "- Clear and concise explanation of the subtopic.",
      "- Important concepts in **bold** or *italic*.",
      "- Real-world analogy: Like a traffic controller for processes.",
      "- Mention of how this concept is used in interviews/exams."
    ]
  }
]
\`\`\`

Only return the JSON array. Do **not** include any extra text or explanation.

Now process the following transcript accordingly:

"${videoTranscript}"
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro-preview-06-05",
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const response = await result.response;
    let text = response.text();

    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    let jsonContent = jsonMatch ? jsonMatch[1] : text;

    jsonContent = jsonContent.replace(/[\u0000-\u001F]/g, "").trim();

    if (!jsonContent.startsWith("[")) {
      jsonContent = `[${jsonContent}]`;
    }

    const structuredNotes = JSON.parse(jsonContent);
    return structuredNotes;
  } catch (error) {
    console.error("❌ Error generating notes:", error.message || error);
    return [];
  }
};

const generateQuestions = async (notes, examType) => {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro-preview-06-05",
    });

    const systemPrompt = `
You are an AI that generates exam-style questions based on the provided notes.

Your output must be a JSON array of question objects. Each object must have:
- "question": the exam-style question (string)
- "answer": the answer to the question (string)
- "type": either "short" or "long" based on the depth of the answer

### Example Output Format:
[
  {
    "question": "What is an operating system?",
    "answer": "An operating system is system software that manages computer hardware and software resources.",
    "type": "short"
  },
  {
    "question": "Explain in detail the various types of operating systems.",
    "answer": "There are several types of operating systems including batch, time-sharing, distributed, network, and real-time systems. Each type is designed for specific tasks...",
    "type": "long"
  }
]

### Instructions:
- Mix both **short** and **long** answer types in the output.
- Ensure answers are exam-appropriate, clear, and detailed where needed.
- DO NOT include any explanation, markdown, or text outside the JSON array.
`;

    const userPrompt = `Generate mixed short and long answer questions for the following notes:\n\n${JSON.stringify(
      notes,
      null,
      2
    )}`;

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
      ],
    });

    const response = result.response;
    const rawContent = response.text();

    let extractedJson = rawContent;

    const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      extractedJson = jsonMatch[1];
    }

    let questionsAndAnswers = [];
    try {
      questionsAndAnswers = JSON.parse(extractedJson);
    } catch (parseError) {
      console.error("JSON Parsing Error:", parseError.message);
      throw new Error("Invalid JSON format received.");
    }

    if (!Array.isArray(questionsAndAnswers)) {
      throw new Error("Invalid Response Format: Expected an array.");
    }

    for (const obj of questionsAndAnswers) {
      if (
        typeof obj !== "object" ||
        !obj.question ||
        !obj.answer ||
        !["short", "long"].includes(obj.type)
      ) {
        throw new Error(
          "Invalid Object Structure: Each entry must have 'question', 'answer', and 'type' ('short' or 'long')."
        );
      }
    }
    console.log("Mixed Q&A:", questionsAndAnswers);
    return questionsAndAnswers;
  } catch (error) {
    console.error(" Error:", error.message);
    return [];
  }
};

const generateRelevanceNotes = async (videoTranscript, userPrompt) => {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro-preview-06-05",
    });

    const prompt = `
You are an advanced relevance-analysis assistant.  

**Step 1:** Extract all key topics or keywords from the user's request, delimited by commas or semicolons.  
**Step 2:** For each topic, scan the transcript and decide:
  • High Relevance: Topic is present and explained in depth (2+ bullet points).  
  • Medium Relevance: Topic is mentioned but only briefly (1 bullet point).  
  • Low Relevance: Topic is not mentioned.  

**Step 3:** Also capture any other major topics from the transcript that were not requested (these go into Low Relevance).  

**For each entry produce an object**:

- "title": the requested topic or “Other: <topic>”  
- "subtitle": “High Relevance” / “Medium Relevance” / “Low Relevance”  
- "description": an array of concise bullet points:
   - For High: 2–4 detailed points
   - For Medium: 1–2 brief points
   - For Low (others): 1–2 points summarizing that “Other” topic

**Output only JSON** with this exact schema:
\`\`\`json
{
  "high_relevance": [ { title, subtitle, description } ],
  "medium_relevance": [ { title, subtitle, description } ],
  "low_relevance": [ { title, subtitle, description } ]
}
\`\`\`

### Input Data  
- **Transcript:**  
\`\`\`text
${videoTranscript}
\`\`\`  
- **User’s Request:**  
\`\`\`text
${userPrompt}
\`\`\`
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const response = await result.response;
    const raw = response.text();

    const m = raw.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = m ? m[1] : raw;

    try {
      const notes = JSON.parse(jsonText);
      return {
        high_relevance: Array.isArray(notes.high_relevance)
          ? notes.high_relevance
          : [],
        medium_relevance: Array.isArray(notes.medium_relevance)
          ? notes.medium_relevance
          : [],
        low_relevance: Array.isArray(notes.low_relevance)
          ? notes.low_relevance
          : [],
      };
    } catch {
      console.error("Failed to parse relevance JSON:", raw);
      return { high_relevance: [], medium_relevance: [], low_relevance: [] };
    }
  } catch (err) {
    console.error("Gemini Error:", err);
    return { high_relevance: [], medium_relevance: [], low_relevance: [] };
  }
};

app.post("/convert-mp3", async (req, res) => {
  try {
    const { videoId, noteType } = req.body;

    console.log("videoid", videoId, "noteTtpe", noteType);

    if (!videoId) {
      return res
        .status(400)
        .json({ status: false, error: "Video ID is required" });
    }

    const response = await fetch(
      `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key":
            "d641d5520fmsh720b0b4cb8edb1cp1efeb3jsn6fbb6ab9422b",
          "x-rapidapi-host": "youtube-mp36.p.rapidapi.com",
        },
      }
    );

    if (!response.ok) {
      console.log(`HTTP error! Status: ${response.status}`);
      return res.status(400).json({
        status: false,
        message: "Something went wrong",
      });
    }

    const data = await response.json();

    if (!data.link) {
      return res
        .status(400)
        .json({ status: false, error: "Failed to fetch MP3 link" });
    }

    const cloudinaryUrl = await downloadAndUpload(data.link);

    const textResponse = await fetch(
      `https://speech-to-text-ai.p.rapidapi.com/transcribe?url=${cloudinaryUrl}`,
      {
        method: "POST",
        headers: {
          "x-rapidapi-key":
            "d641d5520fmsh720b0b4cb8edb1cp1efeb3jsn6fbb6ab9422b",
          "x-rapidapi-host": "speech-to-text-ai.p.rapidapi.com",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!textResponse.ok) {
      throw new Error(`HTTP error! Status: ${textResponse.status}`);
    }

    const data2 = await textResponse.json();

    const resp = await generateNotes(data2.text);

    return res.status(200).json({
      status: true,
      videoId: videoId,
      videoAudio: data?.link,
      audioCloudinaryLink: cloudinaryUrl,
      audioText: data2.text,
      structureNotes: resp,
      audioTitle: data.title,
      audioFileSize: data.filesize,
    });
  } catch (error) {
    console.error("error", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/content-analysis", async (req, res) => {
  const { videoId, userPrompt } = req.body;

  if (!videoId) {
    return res
      .status(400)
      .json({ status: false, error: "Video ID is required" });
  }

  const response = await fetch(
    `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
    {
      method: "GET",
      headers: {
        "x-rapidapi-key": "d641d5520fmsh720b0b4cb8edb1cp1efeb3jsn6fbb6ab9422b",
        "x-rapidapi-host": "youtube-mp36.p.rapidapi.com",
      },
    }
  );

  if (!response.ok) {
    return res.status(400).json({
      status: false,
      message: "Something went wrong",
    });
  }

  const data = await response.json();

  if (!data.link) {
    return res
      .status(400)
      .json({ status: false, error: "Failed to fetch MP3 link" });
  }

  const cloudinaryUrl = await downloadAndUpload(data.link);

  const textResponse = await fetch(
    `https://speech-to-text-ai.p.rapidapi.com/transcribe?url=${cloudinaryUrl}`,
    {
      method: "POST",
      headers: {
        "x-rapidapi-key": "d641d5520fmsh720b0b4cb8edb1cp1efeb3jsn6fbb6ab9422b",
        "x-rapidapi-host": "speech-to-text-ai.p.rapidapi.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!textResponse.ok) {
    throw new Error(`HTTP error! Status: ${textResponse.status}`);
  }

  const data2 = await textResponse.json();

  const resp = await generateRelevanceNotes(data2.text, userPrompt);

  return res.status(200).json({
    status: true,
    videoId: videoId,
    videoAudio: data?.link,
    audioCloudinaryLink: cloudinaryUrl,
    audioText: data2.text,
    structureNotes: resp,
    audioTitle: data.title,
    audioFileSize: data.filesize,
  });
});

app.post("/generate-questions", async (req, res) => {
  try {
    const { notes, examType } = req.body;

    if (!notes || !examType) {
      return res.status(400).json({
        status: false,
        message: "Required data need",
      });
    }

    const resp = await generateQuestions(notes, examType);
    console.log("resp", resp);

    return res.status(200).json({
      data: resp,
    });
  } catch (eror) {
    console.log("error");
    return res.status(500).json({
      status: false,
      message: "internal serveer erreor ",
    });
  }
});

app.listen(PORT, () => {
  console.log("Server running at port", PORT);
});
