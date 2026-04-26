from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0017_add_comment_is_deleted'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='scheduled_at',
            field=models.DateTimeField(blank=True, help_text='Optional scheduled start date/time for this ticket.', null=True),
        ),
        migrations.AddField(
            model_name='ticket',
            name='scheduled_notification_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
