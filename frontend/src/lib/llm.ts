import { baseApi } from '../api';

export async function askGroq(message: string, isPrivateMode: boolean): Promise<string> {
  try {
    const response = await baseApi.post('/llm', { message, isPrivateMode });
    return response.data.reply;
  } catch (error: any) {
    console.error("LLM Backend error:", error);
    const backendError = error.response?.data?.detail || error.message || "Unknown error";
    return `i couldn't reach my brain right now... (Error: ${backendError})`;
  }
}
