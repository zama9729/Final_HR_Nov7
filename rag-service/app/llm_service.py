"""LLM service with function calling support."""
from typing import List, Dict, Any, Optional, Callable
from openai import OpenAI
from app.config import settings
import logging
import json

logger = logging.getLogger(__name__)


class LLMService:
    """LLM service with OpenAI-compatible API."""
    
    def __init__(self):
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url
        )
        self.embedding_model = settings.embedding_model
        self.chat_model = settings.chat_model
        self.tools: Dict[str, Callable] = {}
    
    def get_embedding(self, text: str) -> List[float]:
        """Get embedding for text."""
        try:
            response = self.client.embeddings.create(
                model=self.embedding_model,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise
    
    def register_tool(self, name: str, func: Callable, description: str, parameters: Dict):
        """Register a callable tool for function calling."""
        self.tools[name] = {
            "function": func,
            "description": description,
            "parameters": parameters
        }
        logger.info(f"Registered tool: {name}")
    
    def _get_tools_schema(self) -> List[Dict]:
        """Get OpenAI function calling schema for registered tools."""
        return [
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": info["description"],
                    "parameters": info["parameters"]
                }
            }
            for name, info in self.tools.items()
        ]
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        use_tools: bool = True,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """Chat completion with function calling support."""
        tools = self._get_tools_schema() if use_tools and self.tools else None
        
        try:
            response = self.client.chat.completions.create(
                model=self.chat_model,
                messages=messages,
                tools=tools,
                tool_choice="auto" if tools else None,
                temperature=temperature
            )
            
            message = response.choices[0].message
            result = {
                "content": message.content,
                "role": message.role,
                "tool_calls": []
            }
            
            # Handle tool calls
            if message.tool_calls:
                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)
                    
                    if tool_name in self.tools:
                        try:
                            tool_func = self.tools[tool_name]["function"]
                            tool_result = tool_func(**tool_args)
                            result["tool_calls"].append({
                                "id": tool_call.id,
                                "name": tool_name,
                                "arguments": tool_args,
                                "result": tool_result
                            })
                        except Exception as e:
                            logger.error(f"Tool call {tool_name} failed: {e}")
                            result["tool_calls"].append({
                                "id": tool_call.id,
                                "name": tool_name,
                                "error": str(e)
                            })
                    else:
                        logger.warning(f"Unknown tool: {tool_name}")
            
            return result
        except Exception as e:
            logger.error(f"Chat completion failed: {e}")
            raise
    
    def generate_with_rag(
        self,
        query: str,
        context_chunks: List[str],
        use_tools: bool = True
    ) -> Dict[str, Any]:
        """Generate response with RAG context."""
        # Build prompt with context
        context_text = "\n\n".join([
            f"[Document Section {i+1}]\n{chunk}"
            for i, chunk in enumerate(context_chunks)
        ])
        
        system_prompt = """You are a helpful HR assistant. Answer questions using ONLY the provided context documents.
1. Use the context to answer. If the answer isn't there, say "information not available".
2. Cite document sections (e.g., "Section 1") when possible.
3. Be concise and direct."""
        
        user_prompt = f"""Context:
{context_text}

---
Question: {query}
Answer:"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        return self.chat_completion(messages, use_tools=use_tools)


# Global instance
llm_service = LLMService()

