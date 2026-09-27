import httpx
import msal
import datetime
import urllib.parse
from urllib.parse import urlparse
import logging
from app.config import settings

logger = logging.getLogger("app.services.sharepoint")

class SharePointService:
    def __init__(
        self,
        tenant_id: str = None,
        client_id: str = None,
        client_secret: str = None,
        username: str = None,
        password: str = None,
        scope: str = None,
        site_url: str = None,
        library_name: str = None,
        base_folder: str = None,
        create_year_folder: bool = None,
        create_month_folder: bool = None
    ):
        self.tenant_id = tenant_id or settings.AZURE_TENANT_ID
        self.client_id = client_id or settings.AZURE_CLIENT_ID
        self.client_secret = client_secret or settings.AZURE_CLIENT_SECRET
        self.username = username or settings.AZURE_USERNAME
        self.password = password or settings.AZURE_PASSWORD
        
        scope_str = scope or settings.GRAPH_SCOPE
        self.scope = scope_str.split(" ") if scope_str else ["Sites.ReadWrite.All", "Files.ReadWrite.All"]
        
        self.site_url = site_url or settings.SP_SITE_URL
        self.library_name = library_name or settings.SP_LIBRARY_NAME or "Documents"
        self.base_folder = base_folder if base_folder is not None else settings.SP_BASE_FOLDER
        self.create_year_folder = create_year_folder if create_year_folder is not None else settings.SP_CREATE_YEAR_FOLDER
        self.create_month_folder = create_month_folder if create_month_folder is not None else settings.SP_CREATE_MONTH_FOLDER

        self.authority = f"https://login.microsoftonline.com/{self.tenant_id}" if self.tenant_id else None
        self.app = None

    def _init_app(self):
        if not self.tenant_id or not self.client_id:
            raise ValueError("SharePoint / Azure credentials are not properly configured (missing Tenant ID or Client ID).")
            
        if self.username and self.password:
            self.app = msal.PublicClientApplication(
                self.client_id, authority=self.authority
            )
        else:
            self.app = msal.ConfidentialClientApplication(
                self.client_id, authority=self.authority, client_credential=self.client_secret
            )

    def _get_access_token(self):
        if not self.app:
            self._init_app()
            
        result = None
        if isinstance(self.app, msal.ConfidentialClientApplication):
            result = self.app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        else:
            result = self.app.acquire_token_by_username_password(
                self.username, self.password, scopes=self.scope
            )
            
        if result and "access_token" in result:
            return result["access_token"]
        else:
            err_msg = result.get('error') if result else 'Unknown error'
            err_desc = result.get('error_description') if result else ''
            raise Exception(f"Failed to acquire token: {err_msg} - {err_desc}")

    def upload_excel(self, filename: str, file_bytes: bytes, provided_token: str = None) -> str:
        token = provided_token if provided_token else self._get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        
        # Step 1: Resolve Site ID
        if not self.site_url:
            raise ValueError("SharePoint Site URL is not configured.")
            
        parsed_url = urlparse(self.site_url)
        hostname = parsed_url.netloc
        site_path = parsed_url.path
        
        with httpx.Client() as client:
            site_resp = client.get(
                f"https://graph.microsoft.com/v1.0/sites/{hostname}:{site_path}",
                headers=headers
            )
            site_resp.raise_for_status()
            site_id = site_resp.json()["id"]
            
            # Step 2: Resolve Drive ID
            drives_resp = client.get(
                f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives",
                headers=headers
            )
            drives_resp.raise_for_status()
            drives = drives_resp.json()["value"]
            drive_id = None
            for d in drives:
                if d["name"] == self.library_name:
                    drive_id = d["id"]
                    break
            
            if not drive_id:
                raise Exception(f"Document library '{self.library_name}' not found.")
                
            # Step 3: Ensure folder path
            segments = []
            if self.base_folder:
                segments.append(self.base_folder)
                
            now = datetime.datetime.now()
            
            # Handle both string configuration (from environment) and boolean overrides
            create_year = str(self.create_year_folder).lower() == 'true' if isinstance(self.create_year_folder, str) else bool(self.create_year_folder)
            create_month = str(self.create_month_folder).lower() == 'true' if isinstance(self.create_month_folder, str) else bool(self.create_month_folder)
            
            if create_year:
                segments.append(str(now.year))
            if create_month:
                segments.append(now.strftime("%B"))
                
            current_folder_id = "root"
            for segment in segments:
                # Ping segment
                seg_resp = client.get(
                    f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{current_folder_id}:/{urllib.parse.quote(segment)}",
                    headers=headers
                )
                if seg_resp.status_code == 200:
                    current_folder_id = seg_resp.json()["id"]
                elif seg_resp.status_code == 404:
                    create_resp = client.post(
                        f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{current_folder_id}/children",
                        headers=headers,
                        json={
                            "name": segment,
                            "folder": {},
                            "@microsoft.graph.conflictBehavior": "rename"
                        }
                    )
                    create_resp.raise_for_status()
                    current_folder_id = create_resp.json()["id"]
                else:
                    seg_resp.raise_for_status()
                    
            # Handle duplicate files
            check_resp = client.get(
                f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{current_folder_id}:/{urllib.parse.quote(filename)}",
                headers=headers
            )
            if check_resp.status_code == 200:
                name, ext = filename.rsplit(".", 1)
                filename = f"{name}_{now.strftime('%Y%m%d%H%M%S')}.{ext}"
                
            # Step 4: Stream Binary Data
            upload_headers = headers.copy()
            upload_headers["Content-Type"] = "application/octet-stream"
            
            upload_resp = client.put(
                f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{current_folder_id}:/{urllib.parse.quote(filename)}:/content",
                headers=upload_headers,
                content=file_bytes
            )
            upload_resp.raise_for_status()
            
            return upload_resp.json().get("webUrl")
