from supabase import create_client
import os

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
if not supabase_url or not supabase_key:
    from dotenv import load_dotenv
    load_dotenv("api/.env")
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

supabase = create_client(supabase_url, supabase_key)
res = supabase.table("users").select("id, username").execute()
for user in res.data:
    if user.get("username") and not user["username"].endswith(".kibo"):
        new_username = user["username"] + ".kibo"
        print(f"Updating {user['username']} to {new_username}")
        supabase.table("users").update({"username": new_username}).eq("id", user["id"]).execute()
print("Done!")
