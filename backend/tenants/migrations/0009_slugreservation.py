from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0008_alter_module_icon_alter_module_id_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='SlugReservation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=64, unique=True)),
                ('reserved_at', models.DateTimeField(auto_now_add=True)),
                ('reason', models.CharField(blank=True, max_length=255)),
            ],
            options={
                'ordering': ['-reserved_at'],
            },
        ),
    ]
