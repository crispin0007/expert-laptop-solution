import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_password_reset_token'),
        ('parties', '0002_party_account_link'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenantmembership',
            name='party',
            field=models.OneToOneField(
                blank=True,
                help_text='Optional canonical Party identity for staff accounting linkage.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='staff_profile',
                to='parties.party',
            ),
        ),
    ]
