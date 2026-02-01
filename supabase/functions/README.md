# Supabase Edge Functions

## taste-vectors

Generates taste preference vectors from user input text using OpenAI.

### Setup

1. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**
   ```bash
   supabase login
   ```

3. **Link to your Supabase project**
   ```bash
   supabase link --project-ref your-project-ref
   ```
   You can find your project ref in your Supabase project URL: `https://app.supabase.com/project/YOUR-PROJECT-REF`

4. **Set up OpenAI API Key**
   ```bash
   supabase secrets set OPENAI_API_KEY=your-openai-api-key
   ```
   Get your OpenAI API key from: https://platform.openai.com/api-keys

### Deployment

Deploy the edge function to Supabase:

```bash
supabase functions deploy taste-vectors
```

### Testing Locally

1. **Start Supabase locally** (optional, for local testing)
   ```bash
   supabase start
   ```

2. **Serve the function locally**
   ```bash
   supabase functions serve taste-vectors --env-file ./supabase/.env.local
   ```

3. **Create `.env.local` file** in `supabase/` directory:
   ```
   OPENAI_API_KEY=your-openai-api-key
   ```

4. **Test the function**
   ```bash
   curl -i --location --request POST 'http://localhost:54321/functions/v1/taste-vectors' \
     --header 'Authorization: Bearer YOUR_ANON_KEY' \
     --header 'Content-Type: application/json' \
     --data '{"tasteText":"I love spicy food and prefer vegetarian options"}'
   ```

### Using Custom Prompt Service

If you're using a custom prompt service (like the `askOpenAI` function referenced in your Next.js code), modify the edge function:

1. Open `supabase/functions/taste-vectors/index.ts`
2. Replace the OpenAI API call with your prompt service:
   ```typescript
   // Import your prompt service
   import { askOpenAI } from './prompt-service.ts'

   // In generateTasteVectors function:
   const result = await askOpenAI({
     promptId: "pmpt_69406cd8596c8197a7f08a7dd5d592510ca08c3d1237f0c5",
     version: "4",
     variables: { taste_text: tasteText }
   })

   const cleaned = cleanJSON(result)
   return JSON.parse(cleaned)
   ```

### API Response Format

The edge function returns:

```json
{
  "success": true,
  "vectors": {
    "cuisines": {
      "italian": 0.8,
      "asian": 0.6,
      "mexican": 0.4
    },
    "dietary": {
      "vegetarian": 0.9,
      "vegan": 0.3,
      "glutenFree": 0.2
    },
    "tastes": {
      "spicy": 0.9,
      "sweet": 0.3,
      "savory": 0.7
    },
    "ingredients": {
      "likes": ["vegetables", "tofu", "beans"],
      "dislikes": ["celery", "cilantro"]
    }
  },
  "tasteText": "I love spicy food and prefer vegetarian options"
}
```

### Error Handling

On error, the function returns:

```json
{
  "success": false,
  "error": "Error message"
}
```

### Viewing Logs

View function logs in real-time:

```bash
supabase functions logs taste-vectors --follow
```

Or view in the Supabase Dashboard:
- Go to your project
- Navigate to Edge Functions
- Select `taste-vectors`
- Click on the "Logs" tab

### Troubleshooting

**Function not found error:**
- Make sure you've deployed the function: `supabase functions deploy taste-vectors`
- Check the function name matches exactly in the client code

**OpenAI API errors:**
- Verify your OpenAI API key is set: `supabase secrets list`
- Check your OpenAI account has sufficient credits
- Verify the API key has the correct permissions

**Authentication errors:**
- Make sure the user is logged in before calling the function
- The function requires a valid JWT token in the Authorization header

**CORS errors:**
- The function includes CORS headers by default
- Make sure you're calling from an allowed origin
