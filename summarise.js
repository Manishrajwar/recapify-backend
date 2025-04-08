
const express = require("express");
const fetch = require("node-fetch");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

cloudinary.config({
    cloud_name: "dn3vbnvcs",
    api_key: "665849725345148",
    api_secret: "RrBEvJok6yFsVZaJSc2z1tBUWpk"
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
    if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);
    
    return await uploadFileFromStream(response.body);
};

app.get("/", (req, res) => {
    return res.send("hello world");
});



const generateNotes = async (videoTranscript) => {
    try {
        const response = await fetch('https://chatgpt-42.p.rapidapi.com/chat', {
            method: 'POST',
            headers: {
                'x-rapidapi-key': 'b8086da104msh6283292ae5fcea4p1dd0c3jsn9a21cfefd310',
                'x-rapidapi-host': 'chatgpt-42.p.rapidapi.com',
        //       'x-rapidapi-key': '66eb7c54f0mshe8e6413d5f70797p108a5djsn7352d01077d6',
		// 'x-rapidapi-host': 'chatgpt-42.p.rapidapi.com',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert note-taking assistant. Convert the given video transcript into an **array of structured notes**, where each note object contains the following structure:\n- `title`: Main topic\n- `subtitle`: Subtopic\n- `description`: An array of bullet points, each explaining an aspect of the subtopic in simple language. Use markdown formatting for better readability.'
                    },
                    {
                        role: 'user',
                        content: `Convert the following video transcript into structured notes as an array of objects:\n\n"${videoTranscript}"`
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Response Data:", data);

        // Extract content and clean the response
        let rawContent = data.choices[0]?.message?.content || "[]";
        // rawContent = rawContent.replace(/^```json/, "").replace(/```$/, "").trim(); // Remove code block markers
        const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
const jsonContent = jsonMatch ? jsonMatch[1] : rawContent; // Extract JSON if found

        
        const structuredNotes = JSON.parse(jsonContent);
        console.log(" Generated Notes:", structuredNotes);
        return structuredNotes;
    } catch (error) {
        console.error(" Error:", error.message);
        return [];
    }
};


const generateQuestions = async (notes, examType) => {
    try {
        const response = await fetch('https://chatgpt-42.p.rapidapi.com/chat', {
            method: 'POST',
            headers: {
                // 'x-rapidapi-key': 'b8086da104msh6283292ae5fcea4p1dd0c3jsn9a21cfefd310',
                // 'x-rapidapi-host': 'chatgpt-42.p.rapidapi.com',
              'x-rapidapi-key': '66eb7c54f0mshe8e6413d5f70797p108a5djsn7352d01077d6',
		'x-rapidapi-host': 'chatgpt-42.p.rapidapi.com',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI that generates **ONLY JSON data** for exam questions. The response must be a JSON array containing objects with two keys: **"question"** and **"answer"**.

### **Response Format**:
\`\`\`json
[
    {
        "question": "What is recursion?",
        "answer": "Recursion is a process where a function calls itself to solve a problem."
    },
    {
        "question": "How is recursion used in programming?",
        "answer": "Recursion is used in problems like tree traversal, factorial computation, and backtracking."
    }
]
\`\`\`

### **Instructions**:
- Generate **exam-style questions** based on the given notes.
- Provide **clear and precise** answers.
- The response **must be a valid JSON array** with no extra text, explanations, or code blocks.
`
                    },
                    {
                        role: 'user',
                        content: `Generate questions for the following topic:\n\n${JSON.stringify(notes, null, 2)}`
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        console.log("🔹 Full API Response:", JSON.stringify(data, null, 2));

        if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
            throw new Error("❌ Invalid API Response: Missing choices or message.");
        }

        let rawContent = data.choices[0].message.content;
        console.log("🔹 Extracted Content:", rawContent);

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

        // ✅ Final Data Validation
        if (!Array.isArray(questionsAndAnswers)) {
            throw new Error("Invalid Response Format: Expected an array.");
        }

        for (let obj of questionsAndAnswers) {
            if (typeof obj !== "object" || !obj.question || !obj.answer) {
                throw new Error("Invalid Object Structure: Each entry must have 'question' and 'answer'.");
            }
        }

        console.log(" Generated Questions & Answers:", questionsAndAnswers);
        return questionsAndAnswers;
    } catch (error) {
        console.error(" Error:", error.message);
        return [];
    }
};

const generateRelevanceNotes = async (videoTranscript, userPrompt) => {
    try {
        const response = await fetch('https://chatgpt-42.p.rapidapi.com/chat', {
            method: 'POST',
            headers: {
                // 'x-rapidapi-key': 'b8086da104msh6283292ae5fcea4p1dd0c3jsn9a21cfefd310',
                // 'x-rapidapi-host': 'chatgpt-42.p.rapidapi.com',
              'x-rapidapi-key': '66eb7c54f0mshe8e6413d5f70797p108a5djsn7352d01077d6',
		'x-rapidapi-host': 'chatgpt-42.p.rapidapi.com',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are an advanced video content relevance checker. Your task is to compare the provided YouTube video transcript with the user's requested content and categorize the results into three levels of relevance:

                        1️⃣ **High Relevance**: The content explicitly mentioned by the user is present in the video transcript in a detailed manner. Provide structured notes in the following format:
                        - title: Main topic
                        - subtitle: Subtopic
                        - description: An array of bullet points explaining the subtopic in simple language.

                        2️⃣ **Medium Relevance**: The content requested by the user is present but not explained in full detail in the video transcript. Provide structured notes in the same format as above but with less detail.

                        3️⃣ **Low Relevance**: The video contains topics that are well explained but were **not mentioned by the user**. Provide structured notes in the same format.

                        ### **Input Data:**
                        - **Video Transcript:**  
                        "${videoTranscript}"

                        - **User's Requested Content:**  
                        "${userPrompt}"

                        ### **Output Format:**  
                        \`\`\`json
                        {
                          "high_relevance": [
                            {
                              "title": "Main topic",
                              "subtitle": "Subtopic",
                              "description": [
                                "Bullet point 1",
                                "Bullet point 2"
                              ]
                            }
                          ],
                          "medium_relevance": [
                            {
                              "title": "Main topic",
                              "subtitle": "Subtopic",
                              "description": [
                                "Bullet point 1",
                                "Bullet point 2"
                              ]
                            }
                          ],
                          "low_relevance": [
                            {
                              "title": "Main topic",
                              "subtitle": "Subtopic",
                              "description": [
                                "Bullet point 1",
                                "Bullet point 2"
                              ]
                            }
                          ]
                        }
                        \`\`\`
                        Ensure that the structured notes are **concise, clear, and formatted properly**. Do not include any extra explanations, just the structured data in JSON format.`
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Response Data:", data);

        let rawContent = data.choices[0]?.message?.content || "{}";
        console.log("🔍 Raw API Response:", rawContent);

        // Extract JSON part
        const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonContent = jsonMatch ? jsonMatch[1] : rawContent;

        // Parse JSON
        try {
            const structuredNotes = JSON.parse(jsonContent);
            console.log("Generated Notes:", structuredNotes);
            return structuredNotes;
        } catch (parseError) {
            console.error("JSON Parsing Error:", parseError.message);
            return { high_relevance: [], medium_relevance: [], low_relevance: [] };
        }

    } catch (error) {
        console.error("Error:", error.message);
        return { high_relevance: [], medium_relevance: [], low_relevance: [] };
    }
};

app.post("/convert-mp3", async (req, res) => {
    try {
        // const videoId = "u3qf8AemD1M";
        const {videoId , noteType} = req.body;

        console.log("videoid" , videoId , "noteTtpe" , noteType);

        // return ;

        if (!videoId) {
            return res.status(400).json({status:false ,  error: "Video ID is required" });
        }

        const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
            method: "GET",
            headers: {
                // "x-rapidapi-key": "b8086da104msh6283292ae5fcea4p1dd0c3jsn9a21cfefd310",
                // "x-rapidapi-host": "youtube-mp36.p.rapidapi.com"
                	'x-rapidapi-key': '66eb7c54f0mshe8e6413d5f70797p108a5djsn7352d01077d6',
		'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com'
            }
        });

        if (!response.ok) {
            console.log(`HTTP error! Status: ${response.status}`);
            return res.status(400).json({
                status:false , 
                message:"Something went wrong"
            })
        }

        const data = await response.json();
        console.log("YouTube MP3 Data:", data);

        if (!data.link) {
            return res.status(400).json({ status: false ,  error: "Failed to fetch MP3 link" });
        }

        const cloudinaryUrl = await downloadAndUpload(data.link);
        console.log("Cloudinary MP3 URL:", cloudinaryUrl);

        const textResponse = await fetch(`https://speech-to-text-ai.p.rapidapi.com/transcribe?url=${cloudinaryUrl}`, {
            method: "POST",
            headers: {
                // "x-rapidapi-key": "b8086da104msh6283292ae5fcea4p1dd0c3jsn9a21cfefd310",
                // "x-rapidapi-host": "speech-to-text-ai.p.rapidapi.com",
                // "Content-Type": "application/x-www-form-urlencoded"
                'x-rapidapi-key': '66eb7c54f0mshe8e6413d5f70797p108a5djsn7352d01077d6',
                'x-rapidapi-host': 'speech-to-text-ai.p.rapidapi.com',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!textResponse.ok) {
            throw new Error(`HTTP error! Status: ${textResponse.status}`);
        }

        const data2 = await textResponse.json();
        console.log("Speech-to-Text Data:", data2.text);

        // res.json({ mp3Data: data, transcription: data2 });
        // data2.text
        const resp = await generateNotes(data2.text);
        console.log("resp" ,resp);

        return res.status(200).json({
            status: true , 
            videoId: videoId , 
           videoAudio: data?.link , 
            audioCloudinaryLink: cloudinaryUrl , 
            audioText: data2.text , 
            structureNotes:resp , 
            audioTitle: data.title , 
            audioFileSize: data.filesize , 

        })


    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/content-analysis" , async(req ,res)=>{
     const {videoId , userPrompt} = req.body;

      console.log("videoId" , videoId , userPrompt);

      if (!videoId) {
        return res.status(400).json({status:false ,  error: "Video ID is required" });
    }

    const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
        method: "GET",
        headers: {
            // "x-rapidapi-key": "b8086da104msh6283292ae5fcea4p1dd0c3jsn9a21cfefd310",
            // "x-rapidapi-host": "youtube-mp36.p.rapidapi.com"
            'x-rapidapi-key': '66eb7c54f0mshe8e6413d5f70797p108a5djsn7352d01077d6',
		'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com'
        }
    });

    if (!response.ok) {
        console.log(`HTTP error! Status: ${response.status}`);
        return res.status(400).json({
            status:false , 
            message:"Something went wrong"
        })
    }

    const data = await response.json();
    console.log("YouTube MP3 Data:", data);

    if (!data.link) {
        return res.status(400).json({ status: false ,  error: "Failed to fetch MP3 link" });
    }

    const cloudinaryUrl = await downloadAndUpload(data.link);
    console.log("Cloudinary MP3 URL:", cloudinaryUrl);

    // ✅ Step 2: Transcribe Audio (Speech-to-Text API)
    const textResponse = await fetch(`https://speech-to-text-ai.p.rapidapi.com/transcribe?url=${cloudinaryUrl}`, {
        method: "POST",
        headers: {
            // "x-rapidapi-key": "b8086da104msh6283292ae5fcea4p1dd0c3jsn9a21cfefd310",
            // "x-rapidapi-host": "speech-to-text-ai.p.rapidapi.com",
            // "Content-Type": "application/x-www-form-urlencoded"
            'x-rapidapi-key': '66eb7c54f0mshe8e6413d5f70797p108a5djsn7352d01077d6',
            'x-rapidapi-host': 'speech-to-text-ai.p.rapidapi.com',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    if (!textResponse.ok) {
        throw new Error(`HTTP error! Status: ${textResponse.status}`);
    }

    const data2 = await textResponse.json();
    console.log("Speech-to-Text Data:", data2.text);

    const resp = await generateRelevanceNotes(data2.text , userPrompt);

    console.log("resp",resp);

    return res.status(200).json({
        status: true , 
        videoId: videoId , 
       videoAudio: data?.link , 
        audioCloudinaryLink: cloudinaryUrl , 
        audioText: data2.text , 
        structureNotes:resp , 
        audioTitle: data.title , 
        audioFileSize: data.filesize , 

    })

      
})

app.post("/generate-questions" , async(req ,res)=>{
    try{

        const {notes, examType} =req.body;


        console.log("notes" , notes , "examtry" , examType);

         if(!notes || !examType){
             return res.status(400).json({
                status:false ,
                message:"Required data need"
             })
         }   

         const resp = await generateQuestions(notes , examType);
            console.log("resp" ,resp);

            return res.status(200).json({
                data: resp 
            })

    } catch(eror){
         console.log("error");
     return res.status(500).json({
        status:false , 
        message:"internal serveer erreor "
     })
    }
})

app.listen(PORT, () => {
    console.log("Server running at port", PORT);
});