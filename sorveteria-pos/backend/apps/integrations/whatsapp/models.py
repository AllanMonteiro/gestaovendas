from django.db import models

class WhatsAppSession(models.Model):
    """
    Stores the ongoing conversation state for a specific WhatsApp phone number.
    Helps the AI maintain context (cart, address, etc.) between messages.
    """
    phone = models.CharField(max_length=30, unique=True, db_index=True)
    
    # Store JSON context (items found, name, address, payment, etc.)
    context = models.JSONField(default=dict, blank=True)
    
    # Store message history to help AI understand "it" or "that one"
    history = models.JSONField(default=list, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Session: {self.phone} (Updated: {self.updated_at})"

    class Meta:
        verbose_name = "WhatsApp Session"
        verbose_name_plural = "WhatsApp Sessions"
