use super::common::Tag;
use serde_json;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;

// Tag service for managing tag data
pub struct TagService {
    tags: Arc<RwLock<HashMap<String, Tag>>>,
    file_path: String,
}

impl TagService {
    pub fn new(file_path: impl Into<String>) -> Self {
        Self {
            tags: Arc::new(RwLock::new(HashMap::new())),
            file_path: file_path.into(),
        }
    }

    pub async fn load_tags(&self) -> Result<(), Box<dyn std::error::Error>> {
        if !Path::new(&self.file_path).exists() {
            // Create empty file if it doesn't exist
            self.save_tags().await?;
            return Ok(());
        }

        let content = fs::read_to_string(&self.file_path).await?;
        let tags: Vec<Tag> = serde_json::from_str(&content).unwrap_or_default();

        let mut tag_map = self.tags.write().await;
        tag_map.clear();
        for tag in tags {
            tag_map.insert(tag.code.clone(), tag);
        }

        tracing::info!("Loaded {} tags from {}", tag_map.len(), self.file_path);
        Ok(())
    }

    pub async fn save_tags(&self) -> Result<(), Box<dyn std::error::Error>> {
        let tags = self.tags.read().await;
        let tags_vec: Vec<Tag> = tags.values().cloned().collect();
        let content = serde_json::to_string_pretty(&tags_vec)?;
        fs::write(&self.file_path, content).await?;
        tracing::info!("Saved {} tags to {}", tags_vec.len(), self.file_path);
        Ok(())
    }

    pub async fn update_tags(&self, new_tags: Vec<Tag>) -> Result<(), Box<dyn std::error::Error>> {
        let mut tags = self.tags.write().await;
        tags.clear();
        for tag in new_tags {
            tags.insert(tag.code.clone(), tag);
        }
        drop(tags); // Release the lock before saving

        self.save_tags().await?;
        Ok(())
    }

    pub async fn check_tag(&self, code: &str) -> bool {
        let tags = self.tags.read().await;
        tags.contains_key(code)
    }

    pub async fn get_tag(&self, code: &str) -> Option<Tag> {
        let tags = self.tags.read().await;
        tags.get(code).cloned()
    }
}
