from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0013_add_projectproduct_unit_price'),
    ]

    operations = [
        migrations.AlterField(
            model_name='projectproduct',
            name='product',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='project_usages',
                to='inventory.product',
            ),
        ),
        migrations.AddField(
            model_name='projectproduct',
            name='manual_name',
            field=models.CharField(blank=True, max_length=255, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='projectproduct',
            name='product_sku',
            field=models.CharField(blank=True, max_length=64, default=''),
            preserve_default=False,
        ),
        migrations.AlterUniqueTogether(
            name='projectproduct',
            unique_together={('project', 'product', 'manual_name')},
        ),
        migrations.AlterField(
            model_name='projectproductrequest',
            name='product',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='project_requests',
                to='inventory.product',
            ),
        ),
        migrations.AddField(
            model_name='projectproductrequest',
            name='manual_name',
            field=models.CharField(blank=True, max_length=255, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='projectproductrequest',
            name='product_sku',
            field=models.CharField(blank=True, max_length=64, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='projectproductrequest',
            name='unit_price',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='projectproductrequest',
            name='create_inventory',
            field=models.BooleanField(default=False),
        ),
    ]
